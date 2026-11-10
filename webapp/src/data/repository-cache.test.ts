import { afterEach, describe, expect, it, vi } from 'vitest';
import { moodleGradesQuery } from './repository';
import { invalidateQueryCache, invalidateSourceQueries } from './query-cache';

const cache = { fetchedAt: '2026-11-10T00:00:00Z', checkedAt: '2026-11-10T00:00:00Z', identity: 'fixture-owner', stale: false, refreshing: false, error: null };
const courses = [{ courseId: '101', courseName: 'Fixture course', items: [], total: null }];

afterEach(() => { invalidateQueryCache(); vi.unstubAllGlobals(); });

describe('page resource requests', () => {
  it('shares the grade request, reads cache metadata and explicitly refreshes on demand', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL) => new Response(JSON.stringify({ courses, cache })));
    vi.stubGlobal('fetch', fetcher);
    await Promise.all([moodleGradesQuery.load(), moodleGradesQuery.load()]);
    await moodleGradesQuery.load();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(moodleGradesQuery.getSnapshot()).toMatchObject({ data: courses, cache, error: null });
    await moodleGradesQuery.load(true);
    expect(fetcher.mock.calls[1][0]).toBe('/api/moodle/grades?refresh=1');
  });

  it('keeps the last successful time when the server returns stale data after a failed refresh', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ courses, cache: { ...cache, stale: true, error: 'Fixture timeout' } }))));
    await moodleGradesQuery.load(true);
    expect(moodleGradesQuery.getSnapshot()).toMatchObject({ data: courses, cache: { fetchedAt: cache.fetchedAt, stale: true }, error: 'Fixture timeout' });
  });

  it('drops an old connection response after source credentials are replaced', async () => {
    let finishOld: ((response: Response) => void) | undefined;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finishOld = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ courses: [], cache: { ...cache, identity: 'new-owner' } })));
    vi.stubGlobal('fetch', fetcher);
    const old = moodleGradesQuery.load();
    await Promise.resolve();
    invalidateSourceQueries('moodle');
    await moodleGradesQuery.load();
    finishOld?.(new Response(JSON.stringify({ courses, cache })));
    await old;
    expect(moodleGradesQuery.getSnapshot()).toMatchObject({ data: [], cache: { identity: 'new-owner' } });
  });
});
