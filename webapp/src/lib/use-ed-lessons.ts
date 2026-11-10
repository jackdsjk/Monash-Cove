import { useEffect, useRef, useState } from 'react';
import { getEdLessonQuery, getEdLessonsQuery } from '../data/repository';
import type { EdLessonDetail, EdLessonSummary } from '../types';
import { useResourceQuery } from './use-resource-query';

const EMPTY_LESSONS: EdLessonSummary[] = [];
const DETAIL_CONCURRENCY = 4;

/** The index is visible first; detail requests fill it progressively and survive route changes. */
export function useEdLessons(courseId: number | null) {
  const query = useResourceQuery(getEdLessonsQuery(courseId ?? -1), courseId !== null);
  const summaries = query.data ?? EMPTY_LESSONS;
  const [, update] = useState(0);
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const previousEpoch = useRef(0);

  useEffect(() => {
    let active = true;
    const force = previousEpoch.current !== refreshEpoch;
    previousEpoch.current = refreshEpoch;
    const resources = summaries.map((lesson) => getEdLessonQuery(lesson.id));
    const changed = () => { if (active) update((value) => value + 1); };
    const unsubscribe = resources.map((resource) => resource.subscribe(changed));
    let next = 0;
    const worker = async (): Promise<void> => {
      while (active && next < resources.length) {
        const resource = resources[next++];
        await resource.load(force).catch(() => undefined);
      }
    };
    void Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, resources.length) }, worker));
    return () => { active = false; unsubscribe.forEach((stop) => stop()); };
  }, [summaries, refreshEpoch]);

  const states = summaries.map((lesson) => getEdLessonQuery(lesson.id).getSnapshot());
  const lessons = states.map((state) => state.data).filter((lesson): lesson is EdLessonDetail => lesson !== undefined);
  const detailsLoading = states.some((state) => state.loading || state.cache?.refreshing || state.data === undefined && !state.error);
  const detailError = states.find((state) => state.error)?.error ?? null;
  const complete = query.data !== undefined && lessons.length === summaries.length && !detailsLoading;
  return {
    ...query,
    summaries,
    lessons,
    detailsLoading,
    complete,
    error: query.error ?? detailError,
    refresh: () => { query.refresh(); setRefreshEpoch((value) => value + 1); },
  };
}
