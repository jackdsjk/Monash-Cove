import { afterEach, describe, expect, it, vi } from 'vitest';
import { invalidateQueryCache, ResourceQuery } from './query-cache';

afterEach(() => { invalidateQueryCache(); vi.useRealTimers(); });

describe('shared resource cache', () => {
  it('shows a successful empty result to a new route subscription without reloading', async () => {
    const loader = vi.fn(async () => ({ data: [] as number[] }));
    const query = new ResourceQuery('moodle', loader, 5000);
    const unsubscribe = query.subscribe(() => undefined);
    await query.load();
    unsubscribe();
    const secondSubscription = query.subscribe(() => undefined);
    expect(query.getSnapshot().data).toEqual([]);
    await query.load();
    expect(loader).toHaveBeenCalledTimes(1);
    secondSubscription();
  });

  it('joins concurrent reads and retains old values when refresh fails', async () => {
    let resolve: ((value: { data: string[] }) => void) | undefined;
    const loader = vi.fn(() => new Promise<{ data: string[] }>((done) => { resolve = done; }));
    const query = new ResourceQuery('moodle', loader, 5000);
    const first = query.load();
    const second = query.load(true);
    expect(first).toBe(second);
    await Promise.resolve();
    resolve?.({ data: ['cached'] });
    await first;
    loader.mockRejectedValueOnce(new Error('offline'));
    await expect(query.load(true)).rejects.toThrow('offline');
    expect(query.getSnapshot()).toMatchObject({ data: ['cached'], loading: false, error: 'offline' });
  });

  it('does not restore old-account values when a late request finishes after invalidation', async () => {
    let resolve: ((value: { data: string }) => void) | undefined;
    const query = new ResourceQuery('ed', () => new Promise<{ data: string }>((done) => { resolve = done; }), 5000);
    const pending = query.load();
    await Promise.resolve();
    invalidateQueryCache();
    resolve?.({ data: 'account A' });
    await pending;
    expect(query.getSnapshot().data).toBeUndefined();
    expect(query.getSnapshot().loading).toBe(false);
  });

  it('polls only normal reads until a server background refresh finishes', async () => {
    vi.useFakeTimers();
    const metadata = { fetchedAt: '2026-11-10T00:00:00Z', checkedAt: null, identity: 'fixture', stale: true, refreshing: true, error: null };
    const loader = vi.fn().mockResolvedValueOnce({ data: ['old'], cache: metadata })
      .mockResolvedValueOnce({ data: ['new'], cache: { ...metadata, stale: false, refreshing: false } });
    const query = new ResourceQuery<string[]>('moodle', loader, 5000);
    await query.load();
    expect(query.getSnapshot().data).toEqual(['old']);
    await vi.advanceTimersByTimeAsync(1200);
    expect(query.getSnapshot().data).toEqual(['new']);
    expect(loader.mock.calls).toEqual([[false], [false]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('revalidates local data immediately while keeping the last snapshot and rejecting older reads', async () => {
    let finishOld: ((value: { data: string[] }) => void) | undefined;
    let finishNew: ((value: { data: string[] }) => void) | undefined;
    const loader = vi.fn()
      .mockImplementationOnce(() => new Promise<{ data: string[] }>((resolve) => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise<{ data: string[] }>((resolve) => { finishNew = resolve; }));
    const query = new ResourceQuery<string[]>('moodle', loader, 5000);
    query.replace(['cached']);
    const old = query.load(true);
    await Promise.resolve();
    const current = query.revalidate();
    expect(query.getSnapshot()).toMatchObject({ data: ['cached'], loading: true });
    await Promise.resolve();
    finishOld?.({ data: ['outdated'] });
    await old;
    expect(query.getSnapshot()).toMatchObject({ data: ['cached'], loading: true });
    finishNew?.({ data: ['updated'] });
    await current;
    expect(query.getSnapshot()).toMatchObject({ data: ['updated'], loading: false });
    expect(loader.mock.calls).toEqual([[true], [false]]);
  });

  it('retains the old snapshot after revalidation failure and drops results after a connection change', async () => {
    let finish: ((value: { data: string[] }) => void) | undefined;
    const loader = vi.fn().mockRejectedValueOnce(new Error('local offline'))
      .mockImplementationOnce(() => new Promise<{ data: string[] }>((resolve) => { finish = resolve; }));
    const query = new ResourceQuery<string[]>('moodle', loader, 5000);
    query.replace(['cached']);
    await expect(query.revalidate()).rejects.toThrow('local offline');
    expect(query.getSnapshot()).toMatchObject({ data: ['cached'], error: 'local offline' });
    const pending = query.revalidate();
    await Promise.resolve();
    query.clear();
    finish?.({ data: ['old account'] });
    await pending;
    expect(query.getSnapshot().data).toBeUndefined();
  });
});
