import { describe, expect, it } from 'vitest';
import { availableSemesters, courseInSyncScope, courseSemester, type MoodleCoursePreferences } from './course-sync-preferences';

const preferences: MoodleCoursePreferences = { activeSemester: '2026-S2', hiddenCourseIds: [], pinnedCourseIds: [] };

describe('course sync preferences', () => {
  it('recognizes both term/year orders and leaves unknown names unclassified', () => {
    expect(courseSemester('UNIT101_MUM_s1_2026')).toBe('2026-S1');
    expect(courseSemester('UNIT102_2026-T2')).toBe('2026-T2');
    expect(courseSemester('UNIT103 Summer 2026')).toBe('2026-SUMMER');
    expect(courseSemester('Orientation')).toBeNull();
    expect(courseSemester('COURSES12026')).toBeNull();
    expect(courseSemester('UNIT.2026.S2')).toBe('2026-S2');
  });

  it('keeps unknown courses and allows all semesters without guessing an active one', () => {
    expect(courseInSyncScope({ id: 1, shortname: 'Orientation' }, preferences)).toBe(true);
    expect(courseInSyncScope({ id: 1, shortname: 'UNIT_S1_2025' }, preferences)).toBe(false);
    expect(courseInSyncScope({ id: 1, shortname: 'UNIT_S1_2025' }, { ...preferences, activeSemester: null })).toBe(true);
  });

  it('lets pinned courses cross semesters while explicit hiding has priority', () => {
    const course = { id: 1, shortname: 'UNIT_S1_2025' };
    expect(courseInSyncScope(course, { ...preferences, pinnedCourseIds: ['1'] })).toBe(true);
    expect(courseInSyncScope(course, { ...preferences, hiddenCourseIds: ['1'], pinnedCourseIds: ['1'] })).toBe(false);
  });

  it('keeps a saved semester selectable when it has no discovered courses', () => {
    expect(availableSemesters([{ id: 1, shortname: 'UNIT_S1_2026' }, { id: 2, shortname: 'Other_S1_2026' }], '2025-S2')).toEqual(['2026-S1', '2025-S2']);
  });
});
