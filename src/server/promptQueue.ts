type Resolver = (value: string) => void;

export class PromptQueue {
  private waiting: { prompt: unknown; resolve: Resolver } | null = null;

  waitForAnswer(prompt: unknown): Promise<string> {
    return new Promise((resolve) => {
      this.waiting = { prompt, resolve };
    });
  }

  answer(value: string): boolean {
    if (!this.waiting) return false;
    this.waiting.resolve(value);
    this.waiting = null;
    return true;
  }

  current(): unknown {
    return this.waiting?.prompt ?? null;
  }
}

export const promptQueue = new PromptQueue();
