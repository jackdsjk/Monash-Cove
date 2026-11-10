import { useEffect, useState } from 'react';
import { moodleCoursePreferencesQuery, saveMoodleCoursePreferences } from '../data/repository';
import { availableSemesters, courseInSyncScope, courseSemester, type MoodleCoursePreferences } from '../lib/course-sync-preferences';
import { useResourceQuery } from '../lib/use-resource-query';
import type { MoodleCourse } from '../types';
import { Button } from './ui';

export function CourseSyncScope({ courses }: { courses: MoodleCourse[] }) {
  const query = useResourceQuery(moodleCoursePreferencesQuery);
  const [draft, setDraft] = useState<MoodleCoursePreferences | null>(query.data ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDraft(query.data ?? null); if (!query.data) setSaved(false); }, [query.data]);
  const update = (field: 'hiddenCourseIds' | 'pinnedCourseIds', id: string, checked: boolean): void => {
    setSaved(false);
    setDraft((current) => current ? { ...current, [field]: checked ? [...new Set([...current[field], id])] : current[field].filter((value) => value !== id) } : current);
  };
  const save = async (): Promise<void> => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      setDraft(await saveMoodleCoursePreferences(draft));
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存同步范围失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="mb-5 rounded-xl border border-line bg-white px-5 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">同步范围</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs leading-relaxed text-slate-500">设置影响批量资料同步和成绩刷新；浏览仍保留全部课程，单课“同步资料”可手动执行。无法识别学期的课程不会被自动排除。</p>
        {(error ?? query.error) && <p role="alert" className="text-xs text-red-700">{error ?? query.error}</p>}
        {!draft ? (
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{query.loading ? '正在读取同步设置…' : '尚未读取同步设置。'}</span>
            <Button size="sm" disabled={query.loading} onClick={query.refresh}>重新读取</Button>
          </div>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-3">
            <label className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
              学期
              <select value={draft.activeSemester ?? ''} disabled={saving} onChange={(event) => {
                setDraft({ ...draft, activeSemester: event.target.value || null }); setSaved(false);
              }} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm">
                <option value="">全部学期</option>
                {availableSemesters(courses, draft.activeSemester).map((semester) => <option key={semester} value={semester}>{semester}</option>)}
              </select>
            </label>
            <p className="text-xs text-slate-500">置顶课程跨学期同步；隐藏优先于置顶。以下保留所有已发现课程，随时可以取消隐藏。</p>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {courses.map((course) => (
                <div key={course.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1 text-slate-700">{course.shortname || course.fullname}<span className="ml-2 text-slate-400">{courseSemester(course.shortname) ?? '学期未知'}</span></span>
                  <label className="flex items-center gap-1.5"><input type="checkbox" disabled={saving} checked={draft.hiddenCourseIds.includes(String(course.id))} onChange={(event) => update('hiddenCourseIds', String(course.id), event.target.checked)} />隐藏</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" disabled={saving} checked={draft.pinnedCourseIds.includes(String(course.id))} onChange={(event) => update('pinnedCourseIds', String(course.id), event.target.checked)} />置顶</label>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" disabled={saving || query.loading}>{saving ? '正在保存…' : '保存同步范围'}</Button>
              <span className="text-xs text-slate-500">{courses.filter((course) => courseInSyncScope(course, draft)).length} / {courses.length} 门课程纳入同步</span>
              {saved && <span role="status" className="text-xs text-emerald-700">同步范围已保存</span>}
            </div>
          </form>
        )}
      </div>
    </details>
  );
}
