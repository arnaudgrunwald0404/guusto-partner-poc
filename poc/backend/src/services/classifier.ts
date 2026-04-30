/**
 * services/classifier.ts — Claude-powered exceptional praise classifier.
 *
 * Calls Claude API using structured tool use to get a typed classification
 * of whether a Gong call transcript contains genuine exceptional praise
 * about a named employee.
 *
 * Key design decisions:
 * - Tool use (not JSON mode) gives us strict schema enforcement from Claude.
 * - System prompt uses cache_control: ephemeral so the large static prompt
 *   is cached on Anthropic's side — saves tokens on every call.
 * - Temperature 0 for deterministic classification.
 * - 10s timeout; retryable ClassifierError on 5xx/timeout.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  ClassificationResult,
  ClassificationToolResult,
  ClassifierError,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = 'claude-sonnet-4-5';
const CONFIDENCE_THRESHOLD = 0.75;
const TIMEOUT_MS = 10_000;

// The tool name Claude must call with its classification
const TOOL_NAME = 'record_classification';

// ---------------------------------------------------------------------------
// System prompt (static — will be cached on Anthropic's infrastructure)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an AI assistant for ClearCompany, an HR and performance management platform. Your job is to analyze transcripts from Gong sales/support calls and detect whether a customer has said something genuinely exceptional about a specific, named ClearCompany employee during the call.

## Your task

Read the call transcript provided by the user. Then call the \`record_classification\` tool with your assessment.

## Criteria for EXCEPTIONAL praise (all three must be true)

1. **Named individual** — The customer mentions a specific employee by name (first name, last name, or full name). Generic references like "your team", "your support", or "you guys" do NOT count.
2. **Strong positive language** — The customer uses superlatives, emotional language, or unprompted enthusiasm about that individual's personal performance. Words like "best", "saved us", "incredible", "couldn't do this without", "blown away" are signals.
3. **About individual performance** — The praise is about the employee's work, character, or impact — not the product, pricing, or company brand.

## Examples of IS exceptional praise

- "John is the best support engineer we've ever worked with."
- "Sarah saved our account — I genuinely don't know what we'd do without her."
- "I just want to say, Alex went above and beyond to help us with our data migration. He's exceptional."
- "Maria spent three hours with us last Friday. That kind of dedication is rare."

## Examples of NOT exceptional praise

- "Great product, love the interface." → Product compliment, no named employee.
- "The support team was really helpful." → No named individual.
- "Thanks for the help." → Too vague, no name, no substance.
- "You guys have been great." → Generic team praise.
- "John helped me out." → John is named, but praise is vague and lacks emotional weight.

## Output instructions

You MUST call the \`record_classification\` tool exactly once. Do not output any text before or after the tool call. Set all fields accurately based on the transcript.

For \`confidence\`: be honest. If you are uncertain whether the praise meets the bar, score it below 0.75. Only score ≥ 0.75 when the evidence is clear.

For \`recognition_draft\`: if exceptional, write a warm, human-toned 1–3 sentence message that a manager might send to recognize the employee. Quote the customer's exact words. Make it feel personal, not template-y.

For \`reasoning\`: briefly explain your classification decision in 1–2 sentences. This field is for internal logging only — it will NOT be shown to employees or managers.`;

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const CLASSIFICATION_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    'Record the classification result for the given call transcript.',
  input_schema: {
    type: 'object',
    properties: {
      is_exceptional_praise: {
        type: 'boolean',
        description:
          'True if the transcript contains genuine exceptional praise about a named employee.',
      },
      confidence: {
        type: 'number',
        description: 'Confidence score from 0.0 to 1.0.',
      },
      employee_name_mentioned: {
        type: ['string', 'null'],
        description:
          'The name of the employee mentioned, exactly as the customer said it. Null if no individual is named.',
      },
      evidence_quote: {
        type: ['string', 'null'],
        description:
          'Verbatim quote from the transcript (max 200 characters) that best captures the praise. Null if not exceptional.',
      },
      sentiment_magnitude: {
        type: 'string',
        enum: ['very_high', 'high', 'moderate', 'low'],
        description: 'Magnitude of positive sentiment in the praised section.',
      },
      recognition_draft: {
        type: ['string', 'null'],
        description:
          'Draft recognition message for the manager to send (1–3 sentences, warm tone). Null if not exceptional.',
      },
      reasoning: {
        type: 'string',
        description:
          'Brief internal explanation of the classification decision. Not shown to users.',
      },
    },
    required: [
      'is_exceptional_praise',
      'confidence',
      'employee_name_mentioned',
      'evidence_quote',
      'sentiment_magnitude',
      'recognition_draft',
      'reasoning',
    ],
  },
};

// ---------------------------------------------------------------------------
// Main classifier function
// ---------------------------------------------------------------------------

/**
 * Classifies a transcript for exceptional employee praise.
 *
 * @param transcript - The full call transcript or joined snippet text.
 * @returns A ClassificationResult discriminated union.
 * @throws ClassifierError with retryable=true on Anthropic API failures.
 */
export async function classifyTranscript(
  transcript: string
): Promise<ClassificationResult> {
  const client = new Anthropic();

  // Race the API call against a 10s timeout
  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);

  let response: Anthropic.Message;

  try {
    response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 1024,
        temperature: 0,
        tools: [CLASSIFICATION_TOOL],
        // Force Claude to call our tool (not produce free text)
        tool_choice: { type: 'tool', name: TOOL_NAME },
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            // [ASSUMED] Prompt caching: mark system prompt as ephemeral so
            // Anthropic caches it between calls. Requires claude-3-5+ models.
            // This saves ~800 tokens per call once cached.
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Please analyze the following call transcript:\n\n${transcript}`,
          },
        ],
      },
      { signal: timeoutSignal }
    );
  } catch (err: unknown) {
    // AbortError = timeout
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ClassifierError(
        `Claude API timed out after ${TIMEOUT_MS}ms`,
        true
      );
    }
    // Anthropic SDK wraps HTTP errors; check for 5xx status
    if (err instanceof Anthropic.APIError && err.status >= 500) {
      throw new ClassifierError(
        `Claude API server error: ${err.status} ${err.message}`,
        true
      );
    }
    // Non-retryable (4xx, invalid request, etc.)
    throw new ClassifierError(
      `Claude API error: ${err instanceof Error ? err.message : String(err)}`,
      false
    );
  }

  // Extract the tool use block
  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolUseBlock) {
    throw new ClassifierError(
      'Claude did not call the record_classification tool',
      false
    );
  }

  const raw = toolUseBlock.input as ClassificationToolResult;

  // Apply threshold logic
  if (!raw.is_exceptional_praise || raw.confidence < CONFIDENCE_THRESHOLD) {
    return { result: 'below_threshold', reasoning: raw.reasoning };
  }

  if (!raw.employee_name_mentioned) {
    return { result: 'no_employee_identified', reasoning: raw.reasoning };
  }

  return { result: 'classified', data: raw };
}
