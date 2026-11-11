import { afterEach, describe, expect, it, vi } from 'vitest';
import { moodleCoursePreferencesQuery, moodleGradesQuery, revalidateMoodleGrades, saveMoodleCoursePreferences, syncSource } from './repository';
import { invalidateQueryCache, invalidateSourceQueries } from './query-cache';

const cache = { fetchedAt: '2026-11-10T00:00:00Z', checkedAt: '2026-11-10T00:00:00Z', identity: 'fixture-owner', stale: false, refreshing: false, error: null };
const courses = [{ courseId: '101', courseName: 'Fixture course', items: [], total: { earned: null, max: null } }];

afterEach(() => { invalidateQueryCache(); vi.unstubAllGlobals(); });

describe('page resource requests', () => {
  it('re-reads the local grade snapshot after a successful Moodle sync without forcing upstream', async () => {
    moodleGradesQuery.replace(courses);
    let finishRead: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (url === '/api/sync') return Response.json({ ok: true });
      return new Promise<Response>((resolve) => { finishRead = resolve; });
    });
    vi.stubGlobal('fetch', fetcher);
    const pending = syncSource('moodle');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(moodleGradesQuery.getSnapshot()).toMatchObject({ data: courses, loading: true });
    finishRead?.(Response.json({ courses: [], cache }));
    await pending;
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/sync', '/api/moodle/grades']);
    expect(moodleGradesQuery.getSnapshot().data).toEqual([]);
  });

  it('does not refresh grades for failed Moodle sync or successful other-source sync', async () => {
    moodleGradesQuery.replace(courses);
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ error: { message: 'sync offline' } }, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetcher);
    await expect(syncSource('moodle')).rejects.toThrow('sync offline');
    await syncSource('ed');
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/sync', '/api/sync']);
    expect(moodleGradesQuery.getSnapshot().data).toEqual(courses);
  });

  it('does not turn successful content sync into failure when its local grade read fails', async () => {
    moodleGradesQuery.replace(courses);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json({ error: { message: 'grade read offline' } }, { status: 503 })));
    await expect(syncSource('moodle')).resolves.toBeUndefined();
    expect(moodleGradesQuery.getSnapshot()).toMatchObject({ data: courses, error: 'grade read offline' });
  });

  it('exposes partial grade warnings through the snapshot while content sync remains successful', async () => {
    const warning = '部分课程成绩刷新失败（课程 101：HTTP 503）。';
    moodleGradesQuery.replace(courses);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ synced: 1, gradeWarning: warning }))
      .mockResolvedValueOnce(Response.json({ courses, cache: { ...cache, stale: true, error: warning } })));
    await expect(syncSource('moodle')).resolves.toBeUndefined();
    expect(moodleGradesQuery.getSnapshot()).toMatchObject({ data: courses, error: warning });
  });

  it('ignores sync completion after credentials change and retains the new connection data', async () => {
    let finish: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    const pending = syncSource('moodle');
    invalidateSourceQueries('moodle');
    moodleGradesQuery.replace([]);
    finish?.(Response.json({ ok: true }));
    await pending;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(moodleGradesQuery.getSnapshot().data).toEqual([]);
  });

  it('revalidates through a non-forcing generation guard only once for the captured generation', async () => {
    moodleGradesQuery.replace(courses);
    const generation = moodleGradesQuery.getGeneration();
    const fetcher = vi.fn(async () => Response.json({ courses: [], cache }));
    vi.stubGlobal('fetch', fetcher);
    await revalidateMoodleGrades(generation);
    expect(fetcher.mock.calls).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith('/api/moodle/grades', expect.anything());
    await revalidateMoodleGrades(generation);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

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

describe('course preference writes', () => {
  const initial = { activeSemester: null, hiddenCourseIds: [], pinnedCourseIds: [] };
  const updated = { activeSemester: '2026-S2', hiddenCourseIds: ['101'], pinnedCourseIds: ['102'] };

  it('explains a missing local route without claiming the Moodle login has expired', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { message: 'Not found' } }, { status: 404 })));
    await expect(moodleCoursePreferencesQuery.load()).rejects.toThrow('重启本地服务');
    const state = moodleCoursePreferencesQuery.getSnapshot();
    expect(state.data).toBeUndefined();
    expect(state.error).toContain('重启本地服务');
    expect(state.error).toContain('无需重新连接 Moodle');
  });

  it('preserves settings and reports an outdated service when PATCH is missing', async () => {
    moodleCoursePreferencesQuery.replace(initial);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { message: 'Not found' } }, { status: 404 })));
    await expect(saveMoodleCoursePreferences(updated)).rejects.toThrow('重启本地服务');
    expect(moodleCoursePreferencesQuery.getSnapshot().data).toEqual(initial);
  });

  it('installs server-confirmed preferences and invalidates only the affected grade result', async () => {
    moodleCoursePreferencesQuery.replace(initial);
    moodleGradesQuery.replace(courses);
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(updated)));
    vi.stubGlobal('fetch', fetcher);
    await expect(saveMoodleCoursePreferences(updated)).resolves.toEqual(updated);
    expect(fetcher.mock.calls[0]).toMatchObject(['/api/moodle/course-preferences', { method: 'PATCH', body: JSON.stringify(updated) }]);
    expect(moodleCoursePreferencesQuery.getSnapshot().data).toEqual(updated);
    expect(moodleGradesQuery.getSnapshot().data).toBeUndefined();
  });

  it('does not present failed saves as success or discard existing preferences', async () => {
    moodleCoursePreferencesQuery.replace(initial);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Fixture save failure' } }), { status: 500 })));
    await expect(saveMoodleCoursePreferences(updated)).rejects.toThrow('Fixture save failure');
    expect(moodleCoursePreferencesQuery.getSnapshot().data).toEqual(initial);
  });

  it('does not install a late save result after the Moodle connection changes', async () => {
    moodleCoursePreferencesQuery.replace(initial);
    let finish: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const pending = saveMoodleCoursePreferences(updated);
    invalidateSourceQueries('moodle');
    finish?.(new Response(JSON.stringify(updated)));
    await expect(pending).rejects.toThrow('连接状态已改变');
    expect(moodleCoursePreferencesQuery.getSnapshot().data).toBeUndefined();
  });
});
