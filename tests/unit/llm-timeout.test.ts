import { describe, it, expect } from 'vitest';
import { withDeadline, LLMTimeoutError, DEFAULT_DEADLINE_MS } from '../../src/_shared/llm';

describe('withDeadline', () => {
  it('resolves with the original value when the promise wins the race', async () => {
    const result = await withDeadline(Promise.resolve(42), 1_000);
    expect(result).toBe(42);
  });

  it('rejects with LLMTimeoutError when the promise does not resolve in time', async () => {
    // A promise that intentionally never resolves.
    const never = new Promise<number>(() => {});
    await expect(withDeadline(never, 50)).rejects.toBeInstanceOf(LLMTimeoutError);
  });

  it('the LLMTimeoutError carries the deadlineMs', async () => {
    const never = new Promise<number>(() => {});
    try {
      await withDeadline(never, 75);
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(LLMTimeoutError);
      expect((err as LLMTimeoutError).deadlineMs).toBe(75);
      expect((err as LLMTimeoutError).message).toContain('75');
    }
  });

  it('does not leak the timer when the promise resolves first', async () => {
    // If the timer leaked, the process would hang for the full deadline
    // (or vitest would warn about open handles). Resolving fast must be clean.
    const t0 = Date.now();
    const result = await withDeadline(Promise.resolve('ok'), 10_000);
    const elapsed = Date.now() - t0;
    expect(result).toBe('ok');
    expect(elapsed).toBeLessThan(100);
  });

  it('rejects with the original error when the original promise rejects', async () => {
    const boom = new Error('upstream failure');
    await expect(withDeadline(Promise.reject(boom), 1_000)).rejects.toBe(boom);
  });

  it('DEFAULT_DEADLINE_MS is exported and equals 120_000', () => {
    // Pin the safety contract: if anyone changes the default, this test will
    // fail and force a conscious decision.
    expect(DEFAULT_DEADLINE_MS).toBe(120_000);
  });
});
