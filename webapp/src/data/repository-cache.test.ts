import { afterEach, describe, expect, it, vi } from 'vitest';
import { moodleCoursePreferencesQuery, moodleGradesQuery, saveMoodleCoursePreferences } from './repository';
import { invalidateQueryCache, invalidateSourceQueries } from './query-cache';

const cache = { fetchedAt: '2026-11-10T00:00:00Z', checkedAt: '2026-11-10T00:00:00Z', identity: 'fixture-owner', stale: false, refreshing: false, error: null };
const courses = [{ courseId: '101', courseName: 'Fixture course', items: [], total: { earned: null, max: null } }];

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
