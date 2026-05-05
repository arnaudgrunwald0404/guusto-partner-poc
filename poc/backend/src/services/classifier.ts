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

## Criteria for EXCEPTIONAL praise (all four must be true)

1. **Named individual** — The customer mentions a specific employee by name (first name, last name, or full name). Generic references like "your team", "your support", or "you guys" do NOT count.
2. **Strong positive language** — The customer uses emotional language or unprompted enthusiasm about that individual. Words like "incredibly professionally", "integrity", "saved us", "best I've ever worked with", "couldn't do this without", "blown away", "so grateful" are strong signals.
3. **About personal character or exceptional conduct** — The praise is about WHO this person IS or how they conducted themselves in a specific situation — their character, dedication, professionalism, or integrity. It is NOT enough that they simply performed their normal job duties.
4. **Not about the product or experience** — The customer must be praising the PERSON, not using the employee as a vehicle to praise the product, software, or general experience.

## DISQUALIFIERS — these patterns are NOT exceptional praise even when a name is present

**A. Pure politeness / generic thank-you**
A "thank you" or "I appreciate it" directed at a named employee, without substantive description of what made them exceptional. Social courtesy does not qualify.
→ FAIL: "Perfect. Thank you so much, Holly. I really do appreciate it."
→ WHY: This is polite acknowledgment, not a statement about Holly's exceptional qualities or conduct.

**B. Describing a normal job function**
Praise that amounts to "they did their job." Being a subject matter expert, answering questions in one's area, knowing their product — these are expected, not exceptional.
→ FAIL: "She's kind of a subject matter expert on the LMS. If you have questions around your account, ask her — she's a wealth of knowledge for sure."
→ WHY: Being a product expert is a job requirement, not above-and-beyond conduct.

**C. Normal sales or support duties**
Thanking an employee for activities that are clearly part of their standard role: running a demo, onboarding, following up, sending materials.
→ FAIL: "Lauren put in a lot of effort demoing your product. She worked hard on that."
→ WHY: Demoing is a core sales duty. Effort on a demo, however appreciated, is the expected standard.

**D. Product or experience praise with a name attached**
When a customer loves the product, the process, or the outcome — and merely mentions the employee who guided them through it. The enthusiasm is about ClearCompany's software, not the person.
→ FAIL: "What was her name? Harissa? She took me through the program. It looks pretty straightforward really… love it."
→ WHY: The customer loves the product ("love it", "pretty straightforward"). Harissa is mentioned incidentally as the guide, not as the subject of exceptional praise.

## Examples of IS exceptional praise

- "I am so grateful that you are our rep because I think that you have handled the situation incredibly professionally, and also with a lot of integrity." → Personal character (integrity, professionalism under pressure), strong emotional language ("so grateful"), specific situation referenced.
- "John is the best support engineer we've ever worked with. He stayed on the call for three hours until our issue was resolved." → Superlative, specific above-and-beyond act.
- "Sarah saved our account — I genuinely don't know what we'd do without her." → Significant business impact, named individual, strong emotional weight.
- "I just want to say, Alex went above and beyond on our data migration. He's exceptional." → Explicit "above and beyond", named, unprompted.

## Scoring guidance

- Use a high confidence score (≥ 0.85) only when the praise clearly fits the IS criteria and none of the DISQUALIFIERS apply.
- Score 0.50–0.74 when a name is mentioned with positive language but the praise feels routine, transactional, or product-focused.
- Score < 0.50 when the comment is a thank-you, product compliment, or job-function acknowledgment.

## Output instructions

You MUST call the \`record_classification\` tool exactly once. Do not output any text before or after the tool call. Set all fields accurately based on the transcript.

For \`confidence\`: be honest. If you are uncertain whether the praise meets the bar, score it below 0.75. Only score ≥ 0.75 when the evidence is clear and no disqualifier applies.

For \`recognition_draft\`: if exceptional, write a warm, human-toned 1–3 sentence message that a manager might send to recognize the employee. Quote the customer's exact words. Make it feel personal, not template-y.

For \`reasoning\`: briefly explain your classification decision in 1–2 sentences, citing which criterion was met or which disqualifier applied. This field is for internal logging only — it will NOT be shown to employees or managers.`;

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
