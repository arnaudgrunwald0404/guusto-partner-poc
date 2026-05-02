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
