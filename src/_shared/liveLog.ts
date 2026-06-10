import { promises as fs, closeSync } from 'node:fs';
import path from 'node:path';
import { paths } from '@config/paths';

export interface LiveLogEvent {
  ts: string;
  runId: string;
  workflow: string;
  step: string;
  status?: 'ok' | 'error';
  [k: string]: unknown;
}

export interface LLMCallResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface LLMCallOpts {
  error?: string;
}

const CONTENT_PREVIEW_MAX = 500;

/**
 * Module-level registry of open loggers. A single `process.on('exit')`
 * listener iterates this set to close any leaked file descriptors
 * synchronously. This avoids the per-instance listener leak that the
 * previous design caused (one listener per logger, easily exceeding
 * Node's default 10-listener cap in test suites that create many loggers).
 */
const OPEN_LOGGERS = new Set<LiveRunLogger>();
let exitHookInstalled = false;

function installExitHookOnce(): void {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.on('exit', () => {
    // The 'exit' event runs synchronously; we must use the sync close
    // and cannot await anything. Best-effort cleanup of any logger
    // that was never finalized.
    for (const logger of OPEN_LOGGERS) {
      try {
        if (logger.handle) {
          closeSync(logger.handle.fd);
          logger.handle = null;
        }
      } catch {
        // fd may already be closed. Best-effort: nothing else we can do.
      }
    }
  });
}

export class LiveRunLogger {
  /** Per-run log path: {logsDir}/{runId}.json (JSONL content). */
  public readonly filePath: string;
  /** Optional override for the log directory (used by tests). */
  private readonly logsDir: string;
  /** Public so the module-level exit hook can access the fd for sync close. */
  public handle: fs.FileHandle | null = null;
  /** In-memory mirror of events written so far. Useful for tests. */
  private readonly buffer: string[] = [];
  private closed = false;

  constructor(
    public readonly runId: string,
    public readonly workflow: string,
    public readonly startedAt: string = new Date().toISOString(),
    logsDir?: string
  ) {
    this.logsDir = logsDir ?? paths.logs;
    this.filePath = path.join(this.logsDir, `${runId}.json`);
    // Safety net: if the caller never calls complete() or fail() (uncaught
    // throw, process.exit() from outside, etc.), the FileHandle would leak
    // and the log file might be truncated/empty. Register this logger
    // with the module-level exit hook (installed once, on first logger).
    OPEN_LOGGERS.add(this);
    installExitHookOnce();
  }

  /** Convenience accessor so callers can introspect where the file lives. */
  get file(): string {
    return this.filePath;
  }

  /** Open the file (truncating any existing one) and write the `init` event. */
  async open(): Promise<void> {
    if (this.handle) return;
    await fs.mkdir(this.logsDir, { recursive: true });
    this.handle = await fs.open(this.filePath, 'w');
    await this.writeEvent({ step: 'init' });
  }

  /** Append a custom step event. */
  async event(step: string, payload: Record<string, unknown> = {}): Promise<void> {
    await this.writeEvent({ step, ...payload });
  }

  /**
   * Record an LLM call: model, latency, token/cost counts, and a truncated
   * `contentPreview` (first 500 chars). `opts.error` records a failure.
   */
  async llmCall(
    model: string,
    result: LLMCallResult,
    latencyMs: number,
    opts: LLMCallOpts = {}
  ): Promise<void> {
    const contentPreview =
      result.content.length > CONTENT_PREVIEW_MAX
        ? result.content.slice(0, CONTENT_PREVIEW_MAX) + '...'
        : result.content;
    const step = 'llm-call';
    const status: 'ok' | 'error' | undefined = opts.error ? 'error' : 'ok';
    await this.writeEvent({
      step,
      ...(status ? { status } : {}),
      model,
      latencyMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      contentPreview,
      ...(opts.error ? { error: opts.error } : {}),
    });
  }

  /** Write the terminal `complete` event and close the file. Idempotent. */
  async complete(summary: Record<string, unknown> = {}): Promise<void> {
    if (this.closed) return;
    await this.writeEvent({ step: 'complete', status: 'ok', ...summary });
    await this.close();
  }

  /** Write the terminal `failed` event and close the file. Idempotent. */
  async fail(err: unknown, summary: Record<string, unknown> = {}): Promise<void> {
    if (this.closed) return;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    await this.writeEvent({
      step: 'failed',
      status: 'error',
      error: message,
      ...(stack ? { errorStack: stack } : {}),
      ...summary,
    });
    await this.close();
  }

  /** Internal: serialize one event as a JSON line and append to disk. */
  private async writeEvent(partial: { step: string; status?: 'ok' | 'error'; [k: string]: unknown }): Promise<void> {
    if (!this.handle) {
      throw new Error('LiveRunLogger: call open() before writing events');
    }
    const event: LiveLogEvent = {
      ts: new Date().toISOString(),
      runId: this.runId,
      workflow: this.workflow,
      ...partial,
    };
    const line = JSON.stringify(event) + '\n';
    this.buffer.push(line);
    await this.handle.write(line);
  }

  /** Internal: close the file handle. Safe to call when not open. */
  private async close(): Promise<void> {
    if (this.handle) {
      await this.handle.close();
      this.handle = null;
    }
    this.closed = true;
    OPEN_LOGGERS.delete(this);
  }

  /** Test helper: in-memory copy of every line written so far. */
  get writtenLines(): readonly string[] {
    return this.buffer;
  }

  get isClosed(): boolean {
    return this.closed;
  }
}
