export type Limiter = {
  run<T>(task: () => Promise<T>): Promise<T>;
};

/** Limita cuántas reconstrucciones pesadas corren a la vez. */
export function createLimiter(limit: number): Limiter {
  const concurrency = Math.max(1, Math.floor(limit));
  let active = 0;
  const queue: Array<() => void> = [];

  async function acquire(): Promise<void> {
    if (active < concurrency) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
  }

  function release(): void {
    active = Math.max(0, active - 1);
    queue.shift()?.();
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
