/**
 * __tests__/classifier.test.ts — Unit tests for the Claude classifier.
 *
 * Tests cover: RR-H2 acceptance criteria
 * - Exceptional praise with name → correct structured output
 * - Generic product compliment → is_exceptional=false
 * - No employee name → no_employee_identified
 * - confidence < 0.75 → below_threshold
 * - API timeout → ClassifierError with retryable=true
 * - API 5xx → ClassifierError with retryable=true
 * - System prompt has cache_control set
 *
 * All Anthropic SDK calls are mocked — no real API calls made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { ClassifierError } from '../types.js';

// ---------------------------------------------------------------------------
// Mock the Anthropic SDK
// ---------------------------------------------------------------------------

// We'll control what messages.create() returns per-test
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  const APIError = class extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'APIError';
    }
  };

  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  (MockAnthropic as unknown as Record<string, unknown>).APIError = APIError;

  return { default: MockAnthropic, APIError };
});

// ---------------------------------------------------------------------------
// Helper to build a mock Anthropic response with a tool_use block
// ---------------------------------------------------------------------------

function mockToolUseResponse(toolInput: Record<string, unknown>): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-5',
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    content: [
      {
        type: 'tool_use',
        id: 'tu_001',
        name: 'record_classification',
        input: toolInput,
      },
    ],
  } as unknown as Anthropic.Message;
}

// ---------------------------------------------------------------------------
// Import classifyTranscript AFTER mocks are set up
// ---------------------------------------------------------------------------

import { classifyTranscript } from '../services/classifier.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('classifyTranscript()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exceptional praise with named employee → classified result', async () => {
    mockCreate.mockResolvedValueOnce(
      mockToolUseResponse({
        is_exceptional_praise: true,
        confidence: 0.92,
        employee_name_mentioned: 'Samuel Abramsky',
        evidence_quote: "He's the best customer success specialist we've ever worked with.",
        sentiment_magnitude: 'very_high',
        recognition_draft:
          "Samuel — a customer said on a recent call: 'He's the best customer success specialist we've ever worked with.' That's exceptional. Thank you.",
        reasoning: 'Customer used superlatives, named employee directly, unprompted.',
      })
    );

    const result = await classifyTranscript(
      "Samuel Abramsky is the best customer success specialist we've ever worked with."
    );

    expect(result.result).toBe('classified');
    if (result.result === 'classified') {
      expect(result.data.is_exceptional_praise).toBe(true);
      expect(result.data.confidence).toBeGreaterThanOrEqual(0.75);
      expect(result.data.employee_name_mentioned).toBe('Samuel Abramsky');
      expect(result.data.evidence_quote).toBeTruthy();
      expect(result.data.recognition_draft).toBeTruthy();
    }
  });

  it('generic product compliment → below_threshold (is_exceptional=false)', async () => {
    mockCreate.mockResolvedValueOnce(
      mockToolUseResponse({
        is_exceptional_praise: false,
        confidence: 0.10,
        employee_name_mentioned: null,
        evidence_quote: null,
        sentiment_magnitude: 'low',
        recognition_draft: null,
        reasoning: 'Customer praised the product, not a named employee.',
      })
    );

    const result = await classifyTranscript(
      'Great product, love the interface. Your software is amazing.'
    );

    expect(result.result).toBe('below_threshold');
  });

  it('no employee name mentioned → no_employee_identified', async () => {
    mockCreate.mockResolvedValueOnce(
      mockToolUseResponse({
        is_exceptional_praise: true,
        confidence: 0.82,
        employee_name_mentioned: null,
        evidence_quote: 'The team was incredibly helpful throughout the whole process.',
        sentiment_magnitude: 'high',
        recognition_draft: null,
        reasoning: 'Praise is genuine but targets "the team", not a named individual.',
      })
    );

    const result = await classifyTranscript(
      'The team was incredibly helpful throughout the whole process.'
    );

    expect(result.result).toBe('no_employee_identified');
  });

  it('confidence below 0.75 → below_threshold', async () => {
    mockCreate.mockResolvedValueOnce(
      mockToolUseResponse({
        is_exceptional_praise: true,
        confidence: 0.74, // exactly below threshold
        employee_name_mentioned: 'John',
        evidence_quote: 'John helped me out.',
        sentiment_magnitude: 'moderate',
        recognition_draft: null,
        reasoning: 'Praise mentions a name but lacks emotional weight or superlatives.',
      })
    );

    const result = await classifyTranscript('John helped me out.');

    expect(result.result).toBe('below_threshold');
  });

  it('API timeout → ClassifierError with retryable=true', async () => {
    // Simulate AbortError (what AbortSignal.timeout() throws)
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockCreate.mockRejectedValueOnce(abortError);

    await expect(
      classifyTranscript('some transcript')
    ).rejects.toMatchObject({
      name: 'ClassifierError',
      retryable: true,
    });
  });

  it('API 5xx error → ClassifierError with retryable=true', async () => {
    // Dynamically get the mocked APIError constructor
    const AnthropicModule = await import('@anthropic-ai/sdk');
    const APIError = (AnthropicModule.default as unknown as { APIError: new(status: number, msg: string) => Error & { status: number } }).APIError;
    mockCreate.mockRejectedValueOnce(new APIError(503, 'Service Unavailable'));

    await expect(
      classifyTranscript('some transcript')
    ).rejects.toMatchObject({
      name: 'ClassifierError',
      retryable: true,
    });
  });

  it('ClassifierError is instanceof ClassifierError', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    mockCreate.mockRejectedValueOnce(abortError);

    let thrown: unknown;
    try {
      await classifyTranscript('test');
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ClassifierError);
    expect((thrown as ClassifierError).retryable).toBe(true);
  });

  it('system prompt has cache_control: ephemeral set', async () => {
    mockCreate.mockResolvedValueOnce(
      mockToolUseResponse({
        is_exceptional_praise: false,
        confidence: 0.1,
        employee_name_mentioned: null,
        evidence_quote: null,
        sentiment_magnitude: 'low',
        recognition_draft: null,
        reasoning: 'No praise.',
      })
    );

    await classifyTranscript('Hello world');

    // Verify messages.create was called
    expect(mockCreate).toHaveBeenCalledOnce();

    const callArgs = mockCreate.mock.calls[0][0] as {
      system: Array<{ cache_control?: { type: string } }>;
    };

    // The system prompt block must have cache_control: { type: 'ephemeral' }
    expect(callArgs.system).toBeDefined();
    expect(Array.isArray(callArgs.system)).toBe(true);
    const systemBlock = callArgs.system[0];
    expect(systemBlock.cache_control).toEqual({ type: 'ephemeral' });
  });

  // ---------------------------------------------------------------------------
  // Disqualifier tests — real examples from product feedback (April 2026)
  // ---------------------------------------------------------------------------

  it('DISQUALIFIER A: pure thank-you with name → below_threshold', async () => {
    // "Perfect. Thank you so much, Holly. I really do appreciate it."
    // Polite social courtesy, no substance about Holly's exceptional qualities.
    mockCreate.mockResolvedValueOnce(
      mockToolUseResponse({
        is_exceptional_praise: false,
        confidence: 0.25,
        employee_name_mentioned: 'Holly',
        evidence_quote: null,
        sentiment_magnitude: 'low',
        recognition_draft: null,
        reasoning: 'Disqualifier A: Pure thank-you. No substantive description of exceptional conduct or character.',
      })
    );

    const result = await classifyTranscript(
      'Perfect. Thank you so much, Holly. I really do appreciate it.'
    );

    expect(result.result).toBe('below_threshold');
  });

  it('DISQUALIFIER B: job-function praise (subject matter expert) → below_threshold', async () => {
    // "She's a subject matter expert on the LMS. If you have questions, ask her — she's a wealth of knowledge."
    // Being a product expert is the expected job role, not exceptional conduct.
    mockCreate.mockResolvedValueOnce(
      mockToolUseResponse({
        is_exceptional_praise: false,
        confidence: 0.40,
        employee_name_mentioned: null,
        evidence_quote: null,
        sentiment_magnitude: 'moderate',
        recognition_draft: null,
        reasoning: "Disqualifier B: Praise describes employee's job function (subject matter expert). No above-and-beyond conduct identified.",
      })
    );

    const result = await classifyTranscript(
      "She's a lot. She's kind of a subject matter expert also on the LMS. So, if you have any questions around your account, ask because she is a wealth of knowledge for sure."
    );

    expect(result.result).toBe('below_threshold');
  });

  it('DISQUALIFIER C: normal sales duty (demoing product) → below_threshold', async () => {
    // "Lauren put in effort demoing your product." — Running a demo is core sales duty.
    mockCreate.mockResolvedValueOnce(
      mockToolUseResponse({
        is_exceptional_praise: false,
        confidence: 0.35,
        employee_name_mentioned: 'Lauren',
        evidence_quote: null,
        sentiment_magnitude: 'low',
        recognition_draft: null,
        reasoning: 'Disqualifier C: Praise is for running a product demo — a standard sales activity, not exceptional conduct.',
      })
    );

    const result = await classifyTranscript(
      "I know that if Lauren were here, she would want me to thank you for all his effort that he put in, you know, demoing your product."
    );

    expect(result.result).toBe('below_threshold');
  });

  it('DISQUALIFIER D: product praise with employee incidentally named → below_threshold', async () => {
    // "Harissa took me through the program. It looks pretty straightforward… love it."
    // Customer loves the product; Harissa is the guide, not the subject of exceptional praise.
    mockCreate.mockResolvedValueOnce(
      mockToolUseResponse({
        is_exceptional_praise: false,
        confidence: 0.30,
        employee_name_mentioned: 'Harissa',
        evidence_quote: null,
        sentiment_magnitude: 'low',
        recognition_draft: null,
        reasoning: "Disqualifier D: Enthusiasm ('love it', 'pretty straightforward') is directed at the product, not the employee. Harissa is mentioned incidentally as a guide.",
      })
    );

    const result = await classifyTranscript(
      "What was her name? Took me through the program? Harissa? Yep. When she took me through? Yeah, it looks pretty straightforward really… love. It."
    );

    expect(result.result).toBe('below_threshold');
  });

  it('TRUE POSITIVE: personal character + professionalism + integrity → classified', async () => {
    // "I am so grateful that you are our rep because I think that you have handled
    //  the situation incredibly professionally, and also with a lot of integrity."
    // — Personal character praise (integrity, professionalism in a specific situation),
    //   strong emotional language ("so grateful"), no product component.
    mockCreate.mockResolvedValueOnce(
      mockToolUseResponse({
        is_exceptional_praise: true,
        confidence: 0.93,
        employee_name_mentioned: 'Sarah', // name from surrounding transcript context
        evidence_quote: 'I think that you have handled the situation incredibly professionally, and also with a lot of integrity.',
        sentiment_magnitude: 'very_high',
        recognition_draft:
          'A customer said on a recent call: "I think that you have handled the situation incredibly professionally, and also with a lot of integrity." That kind of feedback is rare — thank you for representing ClearCompany with such care.',
        reasoning: 'Strong personal character praise (integrity, professionalism in specific situation), strong emotional language ("so grateful"), no product or routine-duty component. No disqualifiers apply.',
      })
    );

    const result = await classifyTranscript(
      'I am so grateful that you are our rep because I think that you have handled the situation incredibly professionally, and also with a lot of integrity.'
    );

    expect(result.result).toBe('classified');
    if (result.result === 'classified') {
      expect(result.data.confidence).toBeGreaterThanOrEqual(0.75);
      expect(result.data.sentiment_magnitude).toBe('very_high');
      expect(result.data.recognition_draft).toBeTruthy();
    }
  });

  it('structured output schema validates — all required fields present', async () => {
    const toolInput = {
      is_exceptional_praise: true,
      confidence: 0.88,
      employee_name_mentioned: 'Jordan Beaman',
      evidence_quote: 'Jordan saved our implementation.',
      sentiment_magnitude: 'very_high' as const,
      recognition_draft: 'Jordan — a customer said you saved their implementation. Amazing work.',
      reasoning: 'Strong superlative language, named employee, unprompted.',
    };

    mockCreate.mockResolvedValueOnce(mockToolUseResponse(toolInput));

    const result = await classifyTranscript(
      'Jordan Beaman saved our implementation, I cannot overstate how much she helped.'
    );

    expect(result.result).toBe('classified');
    if (result.result === 'classified') {
      // All required fields must be present
      expect(typeof result.data.is_exceptional_praise).toBe('boolean');
      expect(typeof result.data.confidence).toBe('number');
      expect(result.data.employee_name_mentioned).toBeTruthy();
      expect(result.data.sentiment_magnitude).toMatch(
        /^(very_high|high|moderate|low)$/
      );
      expect(typeof result.data.reasoning).toBe('string');
    }
  });
});
