import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BriefGrades } from './BriefPage'
import { useResourceQuery } from '../lib/use-resource-query'
import { moodleGradesQuery } from '../data/repository'
import type { MoodleGradeCourse } from '../types'

vi.mock('../lib/use-resource-query', () => ({ useResourceQuery: vi.fn() }))

const course = (values: Partial<MoodleGradeCourse> = {}): MoodleGradeCourse => ({
  courseId: 'one', courseName: 'Anonymous fixture course', courseShortName: 'TEST1001_S2_2026',
  total: { earned: null, max: null },
  items: [{ id: 'a', name: 'Hidden mark', grade: null, gradeText: '-', gradeMax: 100, gradingState: 'graded', weight: 100, feedback: 'Private feedback must stay out of the homepage', gradedAt: null }],
  ...values,
})
function show(courses: MoodleGradeCourse[], connected = true, online = true, error: string | null = null) {
  vi.mocked(useResourceQuery).mockImplementation((query) => ({
    data: query === moodleGradesQuery ? courses : { activeSemester: '2026-S2', hiddenCourseIds: ['hidden'], pinnedCourseIds: [] },
    loading: false, error: query === moodleGradesQuery ? error : null, refresh: vi.fn(),
  }) as ReturnType<typeof useResourceQuery>)
  return renderToStaticMarkup(<BriefGrades connected={connected} online={online} />)
}
afterEach(() => vi.clearAllMocks())

describe('homepage shared grade summary', () => {
  it('counts explicitly graded hidden marks without inventing a score or exposing feedback', () => {
    const html = show([course({ overviewGrade: 'HD (provisional)' })])
    expect(html).toContain('已评分 1 / 1 项')
    expect(html).toContain('Moodle Overview 原文：HD (provisional)')
    expect(html).not.toContain('Private feedback')
    expect(html).not.toContain('0 / 100')
    expect(html).toContain('查看全部成绩')
    expect(useResourceQuery).toHaveBeenCalledWith(moodleGradesQuery, true)
  })
  it('does not start authenticated reads or show cached account data when disconnected', () => {
    const html = show([course()], false)
    expect(html).toContain('连接 Moodle 后')
    expect(html).not.toContain('Anonymous fixture course')
    expect(useResourceQuery).toHaveBeenCalledWith(moodleGradesQuery, false)
  })
  it('keeps saved grades visible offline without initiating a refresh', () => {
    expect(show([course()], true, false)).toContain('Anonymous fixture course')
    expect(useResourceQuery).toHaveBeenCalledWith(moodleGradesQuery, false)
  })
  it('applies semester and hidden-course preferences while retaining unknown terms', () => {
    const html = show([
      course({ courseId: 'old', courseName: 'Previous semester', courseShortName: 'TEST1001_S1_2026' }),
      course({ courseId: 'hidden', courseName: 'Hidden course' }),
      course({ courseId: 'unknown', courseName: 'Unknown semester', courseShortName: 'Unknown' }),
      course(),
    ])
    expect(html).not.toContain('Previous semester')
    expect(html).not.toContain('Hidden course')
    expect(html).toContain('Unknown semester')
    expect(html).toContain('Anonymous fixture course')
  })
  it('retains the summary on refresh failure and distinguishes an initial empty result', () => {
    expect(show([course()], true, true, 'Fixture refresh failed')).toContain('Anonymous fixture course')
    expect(show([], true, true, 'Fixture refresh failed')).not.toContain('当前范围暂无成绩数据')
    expect(show([])).toContain('当前范围暂无成绩数据')
  })
})
