/**
 * Copyright 2026 Mark. Licensed under Apache-2.0; see LICENSE.
 * Copied from MarkChu-git/Always-Ontrack at 4e038b4af7f030cd4cdf07832c7e472184a2f519.
 * Cove adaptation: retain the ordered read-concurrency mapper only.
 */
/** Map items with a fixed concurrency ceiling while retaining input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError('Concurrency must be a positive safe integer.');
  }
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

