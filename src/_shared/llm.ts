import OpenAI from 'openai';
import { Agent as HttpsAgent } from 'node:https';

export interface LLMResult {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

const PRICING: Record<string, { in: number; out: number }> = {
  'openai/gpt-4o': { in: 0.0000025, out: 0.00001 },
  'openai/gpt-4o-mini-tts': { in: 0.00000015, out: 0.0000006 },
  'anthropic/claude-3-5-haiku-latest': { in: 0.0000008, out: 0.000004 },
  'anthropic/claude-3-5-sonnet-latest': { in: 0.000003, out: 0.000015 },
  'google/gemini-2.5-flash': { in: 0.000000075, out: 0.0000003 },
  // inclusionAI Ring-2.6-1T (verified via OpenRouter /models, 2026-06-02)
  // Thinking model — completion_tokens includes reasoning tokens.
  'inclusionai/ring-2.6-1t': { in: 0.000000075, out: 0.000000625 },
};

function estimateCost(model: string, inTok: number, outTok: number): number {
  const p = PRICING[model] ?? { in: 0, out: 0 };
  return inTok * p.in + outTok * p.out;
}

/** Default hard deadline for any single LLM HTTP call (overridable per call). */
export const DEFAULT_DEADLINE_MS = 120_000;

/** Thrown when an LLM call does not resolve within its deadline. */
export class LLMTimeoutError extends Error {
  public readonly deadlineMs: number;
  constructor(deadlineMs: number, message?: string) {
    super(message ?? `LLM call timed out after ${deadlineMs}ms`);
    this.name = 'LLMTimeoutError';
    this.deadlineMs = deadlineMs;
  }
}

/**
 * Race a promise against a hard timer. The returned promise:
 *  - resolves with the original value if it wins
 *  - rejects with LLMTimeoutError if the timer fires first
 *  - always clears the timer in the finally to prevent leaks
 *
 * The caller is responsible for also wiring an AbortController (or similar)
 * to actually cancel the underlying request — Promise.race alone cannot
 * cancel a fetch in flight. This helper is about putting an upper bound on
 * how long a workflow step can wait, not about TCP-level cancellation.
 */
export async function withDeadline<T>(promise: Promise<T>, deadlineMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LLMTimeoutError(deadlineMs)), deadlineMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function client(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set. See .env.example.');
  }
  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    // 2-minute per-request timeout. The OpenAI SDK defaults to 600s (10 min)
    // which, combined with `maxRetries: 2`, lets a single LLM call block for
    // ~30 minutes on a hanging connection. Cap that at 2 minutes.
    timeout: DEFAULT_DEADLINE_MS,
    // No silent retries. If the LLM call times out, surface the error to the
    // caller immediately so the live logger records a `failed` event and the
    // operator can see what happened. Retries, if desired, are a workflow-level
    // decision with explicit backoff and logging.
    maxRetries: 0,
    // CRITICAL: disable HTTP keepalive for CLI runs. The OpenAI SDK uses a
    // module-level `agentkeepalive` singleton that pools TCP sockets. For
    // long-running servers this is a perf win; for short-lived CLI scripts
    // it keeps the event loop alive after main() returns, preventing Node
    // from exiting naturally. Without this, even a successful 60s workflow
    // hangs the bash subshell for ~3 more minutes waiting for sockets to
    // drain via the 4s freeSocketTimeout.
    httpAgent: new HttpsAgent({ keepAlive: false }),
  });
}

export async function chatCompletion(
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  opts: { temperature?: number; responseFormat?: 'json' | 'text'; deadlineMs?: number } = {}
): Promise<LLMResult> {
  const c = client();
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;

  // AbortController gives the SDK a way to actually cancel the HTTP request
  // when we time out — Promise.race alone leaves the fetch in flight.
  const controller = new AbortController();
  const callPromise = c.chat.completions.create(
    {
      model,
      messages,
      temperature: opts.temperature ?? 0.2,
      ...(opts.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
    },
    { signal: controller.signal }
  );

  let response;
  try {
    response = await withDeadline(callPromise, deadlineMs);
  } catch (err) {
    // On timeout, ensure the underlying HTTP request is actually cancelled
    // so the socket is freed and the SDK doesn't leak the request.
    controller.abort();
    throw err;
  }

  const choice = response.choices[0];
  const content = choice?.message?.content ?? '';
  const usage = response.usage;
  const tokensIn = usage?.prompt_tokens ?? 0;
  // For thinking models, reasoning tokens are billed at the output rate and
  // reported separately in `usage.completion_tokens_details.reasoning_tokens`.
  // If `completion_tokens` already includes them, this is a no-op (adds 0).
  // If it doesn't, this ensures we bill for the full output. Conservative.
  const reasoningTokens =
    (usage as { completion_tokens_details?: { reasoning_tokens?: number } } | undefined)
      ?.completion_tokens_details?.reasoning_tokens ?? 0;
  const tokensOut = (usage?.completion_tokens ?? 0) + reasoningTokens;
  return {
    content,
    model,
    tokensIn,
    tokensOut,
    costUsd: estimateCost(model, tokensIn, tokensOut),
  };
}
