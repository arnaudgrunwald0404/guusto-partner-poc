/**
 * routes/aiRoutes.ts — AI-assisted recognition drafting (RR-014)
 *
 * POST /api/rr/ai/draft
 *   Body: { recipientName, valueLabel, senderContext? }
 *   Returns: { draft: string }
 *
 * Uses Claude claude-haiku-3-5 for fast, cost-effective draft generation.
 * Falls back gracefully if ANTHROPIC_API_KEY is missing or the call fails.
 */

import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';

export const aiRouter = Router();

// Lazy-init the Anthropic client so dotenv has already run by the time
// the first request comes in (fixes "apiKey not set" at module load time).
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// POST /api/rr/ai/draft — generate a recognition message draft
// ---------------------------------------------------------------------------

aiRouter.post('/draft', async (req: Request, res: Response): Promise<void> => {
  const { recipientName, valueLabel, senderContext, existingDraft } = req.body as {
    recipientName?: string;
    valueLabel?: string;
    senderContext?: string;
    existingDraft?: string;
  };

  if (!recipientName || !valueLabel) {
    res.status(400).json({ error: 'recipientName and valueLabel are required' });
    return;
  }

  const contextClause = senderContext
    ? `\n\nAdditional context from the sender: "${senderContext.trim().slice(0, 300)}"`
    : '';

  const trimmedDraft = existingDraft?.trim() ?? '';

  const prompt = trimmedDraft.length > 0
    ? `You are helping a manager write a recognition message for ${recipientName} that highlights the company value "${valueLabel}".${contextClause}

The manager has already started writing this message:
"""
${trimmedDraft.slice(0, 400)}
"""

Your task: Complete and expand this message. Keep the manager's existing words and tone, then naturally continue and enrich it. The final message must:
- Be at least 150 characters total (including the existing text)
- Flow naturally as one cohesive message (do NOT add labels like "Continuation:" — just write the full message)
- Stay on the same topics and themes the manager started
- Be warm, specific, and genuine
- Written in first person
- End with encouragement about future impact

Respond with ONLY the complete recognition message text (restate the beginning + your additions), no preamble, no quotes.`
    : `Write a warm, specific, and genuine employee recognition message for ${recipientName} highlighting the company value "${valueLabel}".${contextClause}

Requirements:
- At least 150 characters (roughly 25–40 words minimum, aim for 80–150 words)
- Specific and meaningful, not generic
- Written in first person (from a manager/peer)
- Professional but warm in tone
- No placeholders like [specific example] — write something plausible and vivid
- End with encouragement about the future impact

Respond with ONLY the recognition message text, no preamble, no quotes.`;

  try {
    const message = await getClient().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      res.status(500).json({ error: 'Unexpected response format from AI' });
      return;
    }

    res.json({ draft: textBlock.text.trim() });
  } catch (err) {
    console.error('[aiRoutes] draft generation failed:', err);
    res.status(500).json({ error: 'AI draft generation failed. Please write your message manually.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/rr/slack/notify — Slack notification preview (RR-031 mock)
// Generates the Block Kit JSON that would be sent and returns it for preview.
// In production, POST this to the Slack webhook URL.
// ---------------------------------------------------------------------------

aiRouter.post('/slack/notify', (req: Request, res: Response): void => {
  const { shoutoutId, senderName, recipientName, message, values, giftAmountCents } = req.body as {
    shoutoutId?: string;
    senderName?: string;
    recipientName?: string;
    message?: string;
    values?: Array<{ label: string; emoji?: string }>;
    giftAmountCents?: number;
  };

  if (!senderName || !recipientName || !message) {
    res.status(400).json({ error: 'senderName, recipientName, and message are required' });
    return;
  }

  const valueChips = (values ?? []).map(v => `${v.emoji ?? '⭐'} ${v.label}`).join('  ·  ');
  const giftText = giftAmountCents
    ? `\n\n:gift: *$${(giftAmountCents / 100).toFixed(0)} Guusto gift card* is on its way!`
    : '';

  const recognitionUrl = shoutoutId
    ? `http://localhost:5173/recognition/${shoutoutId}`
    : 'http://localhost:5173';

  // Block Kit JSON — what would be POSTed to Slack webhook in production
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🎉 ${recipientName} just got recognized!`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${senderName}* recognized *${recipientName}*${valueChips ? `\n${valueChips}` : ''}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `> ${message}${giftText}`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '👏 React', emoji: true },
          url: recognitionUrl,
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View recognition', emoji: true },
          url: recognitionUrl,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Powered by ClearCompany R&R · <${recognitionUrl}|View online>`,
        },
      ],
    },
  ];

  // In production: POST { blocks } to process.env.SLACK_WEBHOOK_URL
  // For POC: return the preview payload and log it
  const payload = { blocks };
  console.log('[slackNotify] Block Kit preview:', JSON.stringify(payload, null, 2));

  res.json({
    ok: true,
    mode: 'preview',
    payload,
    note: 'In production this would POST to your Slack webhook URL',
  });
});
