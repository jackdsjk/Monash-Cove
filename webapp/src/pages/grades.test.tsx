import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { GradesPage } from './GradesPage'
import { useResourceQuery } from '../lib/use-resource-query'
import { moodleGradesQuery } from '../data/repository'
import type { MoodleGradeCourse } from '../types'

vi.mock('../lib/use-resource-query', () => ({ useResourceQuery: vi.fn() }))
vi.mock('../lib/time', () => ({ useTime: () => ({ fmtWhen: () => 'fixture time' }) }))

const entry = (values: Partial<MoodleGradeCourse> = {}): MoodleGradeCourse => ({
  courseId: '1', courseName: 'FIT1001 Fixture', courseShortName: 'FIT1001_S2_2026',
  items: [{ id: 'a', name: 'Quiz result', grade: 8, gradeMax: 10, weight: 30, feedback: '', gradedAt: null }],
  total: { earned: null, max: null }, ...values,
})
const loaded = (data: unknown) => ({ data, loading: false, error: null, refresh: vi.fn() })
function render(courses: MoodleGradeCourse[], activeSemester: string | null = null) {
  vi.mocked(useResourceQuery).mockImplementation((query) => loaded(query === moodleGradesQuery ? courses : {
    activeSemester, hiddenCourseIds: [], pinnedCourseIds: [],
  }) as ReturnType<typeof useResourceQuery>)
  return renderToStaticMarkup(<GradesPage />)
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Real network blocked') })))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('grade presentation', () => {
  it('renders category detail and keeps an unpublished exam placeholder visible', () => {
    const course = entry()
    course.assessmentStructure = [
      { name: 'Quizzes', url: null, isCategory: true, category: 'Quizzes', categoryId: 1, weight: null, categoryWeight: 30, gradeItemId: null },
      { name: 'Quiz result', url: '/fixture', isCategory: false, category: 'Quizzes', categoryId: 1, weight: null, categoryWeight: null, gradeItemId: 'a' },
      { name: 'Final exam', url: null, isCategory: true, category: 'Final exam', categoryId: 2, weight: null, categoryWeight: 70, gradeItemId: null },
    ]
    const html = render([course])
    expect(html).toContain('分类成绩明细')
    expect(html).toContain('已得 24 / 30 个总评分')
    expect(html).toContain('Final exam')
    expect(html).toContain('评分项目尚未发布')
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="成绩进度图例"')
  })
  it('shows Overview literally and withholds risk predictions for partial weights', () => {
    const html = render([entry({ overviewGrade: 'P (provisional)' })])
    expect(html).toContain('Moodle Overview 原文：P (provisional)')
    expect(html).not.toContain('仍无法达到 50 分线')
    expect(html).not.toContain('课程 hurdle 以原要求为准。')
    expect(html).toContain('8 / 10')
    expect(html).toContain('成绩结构诊断')
  })
  it('labels marked hidden scores without rendering zero or claiming they are pending', () => {
    const course = entry()
    course.items[0] = { ...course.items[0], grade: null, gradeText: '-', gradingState: 'graded', weight: 100 }
    const html = render([course])
    expect(html).toContain('已评分，分数未公开')
    expect(html).toContain('Moodle 已标记评分完成')
    expect(html).toContain('已评分 1 / 1 项')
    expect(html).toContain('还没有已发布的成绩。')
    expect(html).not.toContain('未评分 1 项')
  })
  it('filters by short-name semester and retains unknowns without another upstream read', () => {
    const html = render([
      entry({ courseId: '1', courseName: 'Previous Course', courseShortName: 'FIT1001_S1_2026' }),
      entry({ courseId: '2', courseName: 'Current Course' }),
      entry({ courseId: '3', courseName: 'Unknown Course', courseShortName: 'Unknown' }),
    ], '2026-S2')
    expect(html).not.toContain('Previous Course')
    expect(html).toContain('Current Course')
    expect(html).toContain('Unknown Course')
    expect(useResourceQuery).toHaveBeenCalledTimes(2)
  })
  it('renders the server changes as one dismissible in-app notice', () => {
    const html = render([entry({ gradeChanges: [{ id: 'opaque-event', kind: 'released', itemName: 'Quiz result', detectedAt: '2026-11-11T00:00:00Z' }] })])
    expect(html).toContain('发现 1 项成绩变化')
    expect(html).toContain('关闭成绩提醒')
    expect(html).toContain('成绩已发布')
    expect(html).not.toContain('opaque-event')
  })
})
