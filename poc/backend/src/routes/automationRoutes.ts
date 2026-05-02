/**
 * automationRoutes.ts — Admin API for R&R automation rules.
 *
 * GET  /api/rr/admin/automations          — list all rules
 * POST /api/rr/admin/automations          — save a completed rule
 * PATCH /api/rr/admin/automations/:id     — update status (active|paused|draft)
 * POST /api/rr/admin/automations/chat     — conversational AI builder turn
 */

import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db/schema.js';
import { randomUUID } from 'crypto';

export const automationRouter = Router();

// Instantiated lazily so process.env is populated by dotenv before first use
let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
  return _client;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AutomationTrigger {
  type: 'gong' | 'crm_deal' | 'hris_event' | 'slack_command';
  label: string;
  integrationStatus?: 'connected' | 'needs_setup' | 'unknown';
  integrationRequired?: string;
  conditions?: string[];
}

interface AutomationBusinessRules {
  requireManagerApproval: boolean;
  recognitionEnabled: boolean;
  recognitionVisibility: 'company' | 'team' | 'private';
  rewardEnabled: boolean;
  rewardAmountCents?: number;
  frequencyLimit?: string;
}

interface AutomationSpec {
  name?: string;
  description?: string;
  trigger?: AutomationTrigger;
  businessRules?: AutomationBusinessRules;
  ready?: boolean;
}

interface AutomationRuleRow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: string;
  conditions: string;
  require_manager_approval: number;
  recognition_enabled: number;
  recognition_visibility: string;
  reward_enabled: number;
  reward_amount_cents: number | null;
  frequency_limit: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// GET /api/rr/admin/automations
// ---------------------------------------------------------------------------

automationRouter.get('/', (_req: Request, res: Response): void => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM rr_automation_rules ORDER BY created_at DESC'
  ).all() as AutomationRuleRow[];

  const rules = rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    triggerType: r.trigger_type,
    triggerConfig: JSON.parse(r.trigger_config) as Record<string, unknown>,
    conditions: JSON.parse(r.conditions) as string[],
    requireManagerApproval: r.require_manager_approval === 1,
    recognitionEnabled: r.recognition_enabled === 1,
    recognitionVisibility: r.recognition_visibility,
    rewardEnabled: r.reward_enabled === 1,
    rewardAmountCents: r.reward_amount_cents,
    frequencyLimit: r.frequency_limit,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  res.json({ rules });
});

// ---------------------------------------------------------------------------
// POST /api/rr/admin/automations — persist a completed rule
// ---------------------------------------------------------------------------

automationRouter.post('/', (req: Request, res: Response): void => {
  const { spec } = req.body as { spec: AutomationSpec };

  if (!spec?.name || !spec.trigger?.type || !spec.businessRules) {
    res.status(400).json({ error: 'Incomplete automation spec' });
    return;
  }

  const db = getDb();
  const id = `auto_${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const triggerConfig = JSON.stringify({
    integrationStatus: spec.trigger.integrationStatus ?? 'needs_setup',
    ...( spec.trigger.type === 'crm_deal' ? { crmType: 'salesforce', event: 'deal_closed' } : {} ),
    ...( spec.trigger.type === 'hris_event' ? { eventType: 'anniversary' } : {} ),
  });

  const conditions = JSON.stringify(spec.trigger.conditions ?? []);

  db.prepare(`
    INSERT INTO rr_automation_rules
      (id, name, description, trigger_type, trigger_config, conditions,
       require_manager_approval, recognition_enabled, recognition_visibility,
       reward_enabled, reward_amount_cents, frequency_limit, status, created_by, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id,
    spec.name,
    spec.description ?? null,
    spec.trigger.type,
    triggerConfig,
    conditions,
    spec.businessRules.requireManagerApproval ? 1 : 0,
    spec.businessRules.recognitionEnabled ? 1 : 0,
    spec.businessRules.recognitionVisibility,
    spec.businessRules.rewardEnabled ? 1 : 0,
    spec.businessRules.rewardAmountCents ?? null,
    spec.businessRules.frequencyLimit ?? null,
    'active',
    'admin',
    now,
    now,
  );

  res.status(201).json({ id, message: 'Automation created successfully' });
});

// ---------------------------------------------------------------------------
// PATCH /api/rr/admin/automations/:id — toggle status
// ---------------------------------------------------------------------------

automationRouter.patch('/:id', (req: Request, res: Response): void => {
  const { id } = req.params as { id: string };
  const { status } = req.body as { status?: string };

  if (!status || !['active', 'paused', 'draft'].includes(status)) {
    res.status(400).json({ error: 'status must be active, paused, or draft' });
    return;
  }

  const db = getDb();
  const result = db.prepare(
    'UPDATE rr_automation_rules SET status = ?, updated_at = ? WHERE id = ?'
  ).run(status, new Date().toISOString(), id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Automation not found' });
    return;
  }

  res.json({ id, status });
});

// ---------------------------------------------------------------------------
// POST /api/rr/admin/automations/chat — conversational AI builder
//
// Body:  { messages: [{role, content}][], currentSpec?: AutomationSpec }
// Reply: { reply: string, spec: AutomationSpec, isComplete: boolean }
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an automation setup assistant embedded in ClearCompany's R&R (Recognition & Rewards) admin panel.

Your job: help HR admins create automated recognition workflows through natural conversation. You ask focused questions, extract structured configuration, and emit spec updates as you gather information.

AVAILABLE TRIGGER SOURCES:
- gong: Scans Gong call transcripts for exceptional customer praise of a specific employee
- crm_deal: Fires on CRM events (deal closed, upsell, milestone) — supports Salesforce & HubSpot
- hris_event: Fires on HRIS events (tenure anniversaries, promotions, new hires) — reads from ClearCompany
- slack_command: Fires when a manager uses the /recognize Slack slash command

CONFIGURATION YOU NEED TO COLLECT:
1. TRIGGER — what data source and what event?
2. CONDITIONS — any filters? (confidence threshold, deal size, tenure milestone)
3. MANAGER APPROVAL — required before recognition is sent? (strongly recommended for monetary rewards)
4. RECOGNITION VISIBILITY — company-wide, team-only, or private?
5. REWARD — Guusto gift card attached? How much? (USD)
6. FREQUENCY LIMIT — how often can the same employee be recognized by this rule?

CONVERSATION STYLE:
- Ask 1–2 questions per turn, not all at once
- Be conversational and specific, not bureaucratic
- When you have enough info, summarize the spec and ask for confirmation before finalizing
- Keep replies concise — this is a form helper, not a chatbot essay

SPEC UPDATE TOOL:
Use the update_spec tool after EVERY reply to emit the current (possibly partial) spec. Even a partial spec with just the trigger is useful — it shows the admin progress in real time.

When the spec is fully confirmed and the admin has approved it, set ready: true in the spec and say something like "All set! Click 'Save & Activate' to go live."

INTEGRATION STATUS HEURISTICS:
- gong: mark as 'connected' (the POC already has Gong wired)
- hris_event: mark as 'connected' (ClearCompany has native HRIS access)
- crm_deal: mark as 'needs_setup' (requires Salesforce/HubSpot OAuth)
- slack_command: mark as 'needs_setup' (requires Slack app install)`;

const UPDATE_SPEC_TOOL: Anthropic.Tool = {
  name: 'update_spec',
  description: 'Emit the current automation spec as you gather information. Call this after every reply, even with a partial spec.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Short name for the automation rule (e.g. "Gong — Customer Praise")',
      },
      description: {
        type: 'string',
        description: 'One-sentence description of what this automation does',
      },
      trigger: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['gong', 'crm_deal', 'hris_event', 'slack_command'] },
          label: { type: 'string', description: 'Human-readable trigger label' },
          integrationStatus: { type: 'string', enum: ['connected', 'needs_setup', 'unknown'] },
          integrationRequired: { type: 'string', description: 'What needs to be set up, if anything' },
          conditions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Human-readable filter conditions',
          },
        },
        required: ['type', 'label'],
      },
      businessRules: {
        type: 'object',
        properties: {
          requireManagerApproval: { type: 'boolean' },
          recognitionEnabled: { type: 'boolean' },
          recognitionVisibility: { type: 'string', enum: ['company', 'team', 'private'] },
          rewardEnabled: { type: 'boolean' },
          rewardAmountCents: { type: 'number', description: 'Gift card value in cents' },
          frequencyLimit: { type: 'string', description: 'e.g. "Once per employee per 7 days"' },
        },
      },
      ready: {
        type: 'boolean',
        description: 'Set to true only when the admin has confirmed the full spec and it is ready to save',
      },
    },
  },
};

automationRouter.post('/chat', async (req: Request, res: Response): Promise<void> => {
  const { messages, currentSpec } = req.body as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    currentSpec?: AutomationSpec;
  };

  if (!messages || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  const systemWithContext = currentSpec
    ? `${SYSTEM_PROMPT}\n\nCURRENT PARTIAL SPEC:\n${JSON.stringify(currentSpec, null, 2)}`
    : SYSTEM_PROMPT;

  try {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemWithContext,
      tools: [UPDATE_SPEC_TOOL],
      messages,
    });

    // Extract the text reply and any spec update from tool use
    let reply = '';
    let updatedSpec: AutomationSpec = currentSpec ?? {};

    for (const block of response.content) {
      if (block.type === 'text') {
        reply = block.text;
      } else if (block.type === 'tool_use' && block.name === 'update_spec') {
        updatedSpec = block.input as AutomationSpec;
      }
    }

    // If the model only used tool_use (no text), get the text from a follow-up
    // (tool_use without text means stop_reason=tool_use — we need to handle that)
    if (!reply && response.stop_reason === 'tool_use') {
      // Re-send with tool result so the model produces its text reply
      const toolUseBlock = response.content.find(b => b.type === 'tool_use');
      if (toolUseBlock && toolUseBlock.type === 'tool_use') {
        const followUp = await getClient().messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemWithContext,
          tools: [UPDATE_SPEC_TOOL],
          messages: [
            ...messages,
            { role: 'assistant', content: response.content },
            {
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: toolUseBlock.id,
                content: 'Spec updated.',
              }],
            },
          ],
        });
        for (const block of followUp.content) {
          if (block.type === 'text') reply = block.text;
          if (block.type === 'tool_use' && block.name === 'update_spec') {
            updatedSpec = block.input as AutomationSpec;
          }
        }
      }
    }

    res.json({
      reply: reply || 'Got it — let me update the spec.',
      spec: updatedSpec,
      isComplete: updatedSpec.ready === true,
    });
  } catch (err) {
    console.error('[automationChat] Error:', err);
    res.status(500).json({ error: 'AI chat failed — check ANTHROPIC_API_KEY' });
  }
});
