import { describe, expect, it } from 'vitest'
import type { MoodleGradeCourse, MoodleGradeItem } from '../types'
import { courseSummary, gradeBreakdown, gradeItemWeights, isGradeReleased, isGradeMarked, isPassFail, isPassFailFailure, isGradeVisible, gradeStatus, gradeOutlook, gradeCoursesInView, percentage } from './grades'

const row = (values: Partial<MoodleGradeItem> = {}): MoodleGradeItem => ({
  id: 'a', name: 'Assessment', grade: 8, gradeMax: 10, weight: 20,
  feedback: '', gradedAt: null, ...values,
})
const course = (items: MoodleGradeItem[], total: MoodleGradeCourse['total'] = { earned: null, max: null }): MoodleGradeCourse => ({
  courseId: '1', courseName: 'TEST101 Fixture', items, total,
})

describe('Moodle to Muster grade adapter', () => {
  it('excludes Pass/Fail ranges from numeric grades and only exposes Fail results', () => {
    const pass = row({ id: 'pass', grade: null, gradeMax: null, gradeText: 'Pass', gradeRange: 'Fail–Pass', weight: 15 })
    const fail = row({ id: 'fail', grade: null, gradeMax: null, gradeText: 'Fail', gradeRange: 'Fail, Pass', weight: 15 })
    const input = course([row({ weight: 70 }), pass, fail])
    expect(courseSummary(input)).toMatchObject({ current: 80, earned: 56, hidden: 0, gradedWeight: 70, gradedCount: 1 })
    expect(percentage(pass)).toBeNull()
    expect(isGradeVisible(pass)).toBe(false)
    expect(isGradeVisible(fail)).toBe(true)
    expect(isPassFailFailure(fail)).toBe(true)
    expect(gradeOutlook(input)).toBeNull()
    expect(courseSummary(course([pass, fail]))).toMatchObject({ current: null, hasWeights: false, earned: 0, lost: 0 })
    // Exact legacy text is supported, but a known numeric Range takes precedence.
    expect(isPassFail(row({ gradeText: 'Pass', gradeRange: undefined }))).toBe(true)
    expect(isPassFail(row({ gradeText: 'Pass', gradeRange: '0–100' }))).toBe(false)
    expect(isPassFail(row({ gradeText: 'HD', gradeMax: null }))).toBe(false)
    expect(isPassFail(row({ gradeText: 'Pass', gradeRange: 'Fail, Pass, Distinction' }))).toBe(false)
  })
  it('does not treat explicit Ungraded as released even with an old numeric zero or graded state', () => {
    const ungraded = row({ id: 'pending', gradeText: 'Ungraded', grade: 0, weight: 50, gradingState: 'graded' })
    expect(isGradeReleased(ungraded)).toBe(false)
    expect(isGradeVisible(ungraded)).toBe(false)
    expect(courseSummary(course([row({ weight: 50 }), ungraded])).current).toBe(80)
  })
  it('keeps marked but unpublished scores hidden rather than pending or zero', () => {
    const hidden = row({ grade: null, gradeText: '-', gradingState: 'graded', weight: 100 })
    expect(isGradeReleased(hidden)).toBe(false)
    expect(isGradeMarked(hidden)).toBe(true)
    expect(gradeStatus(hidden)).toBe('已评分，分数未公开')
    expect(courseSummary(course([hidden]))).toMatchObject({ gradedCount: 1, ungradedCount: 0, hidden: 100, ungraded: 0, earned: 0, current: null })
    expect(gradeBreakdown(course([hidden])).categories[0].items[0].state).toBe('hidden')
    expect(gradeOutlook(course([hidden]))).toBeNull()
    expect(gradeStatus(row({ gradingState: 'graded' }))).toBe('已评分')
  })
  it('never infers failure from partial weights or unreadable scores', () => {
    expect(gradeOutlook(course([row({ weight: 20 })]))).toBeNull()
    expect(gradeOutlook(course([row({ gradeMax: null, weight: 100 })]))).toBeNull()
    expect(gradeOutlook(course([row({ grade: 1, weight: 100 })]))).toContain('无法达到')
    expect(gradeOutlook(course([row({ weight: 100 })]))).toContain('达到 50 分线')
  })
  it('filters local semesters, keeps unknown terms, and pins by course ID with hidden priority', () => {
    const entries = [
      { ...course([]), courseId: '1', courseName: 'FIT1001 S1_2026' },
      { ...course([]), courseId: '2', courseName: 'FIT1001 S2_2026' },
      { ...course([]), courseId: '3', courseName: 'FIT1001 Unknown' },
      { ...course([]), courseId: '4', courseName: 'FIT1001 S2_2026' },
    ]
    const preferences = { activeSemester: null, hiddenCourseIds: ['4'], pinnedCourseIds: ['3', '4'] }
    expect(gradeCoursesInView(entries, '2026-S2', preferences).map((entry) => entry.courseId)).toEqual(['3', '2'])
    expect(gradeCoursesInView(entries, null, preferences).map((entry) => entry.courseId)).toEqual(['3', '1', '2'])
  })
  it('uses the copied calculator for earned points and a weighted released average', () => {
    const input = course([row(), row({ id: 'b', grade: 9, weight: 30 }), row({ id: 'c', grade: null, weight: 50 })])
    const result = courseSummary(input)
    expect(result.earned).toBeCloseTo(43)
    expect(result.current).toBeCloseTo(86)
    expect(result.gradedWeight).toBe(50)
    expect(result.ungraded).toBe(50)
    expect(result.weightsComplete).toBe(true)
    expect(gradeBreakdown(input).needed).toBeCloseTo(7)
  })
  it('keeps missing weights unknown instead of inventing equal weighting', () => {
    const result = courseSummary(course([row(), row({ id: 'b', grade: 1, weight: null })]))
    expect(result.hasWeights).toBe(true)
    expect(result.earned).toBe(16)
    expect(result.weightsComplete).toBe(false)
    expect(result.current).toBeNull()
    expect(result.band).toBeNull()
  })
  it('does not stretch a partial 20% structure to a 100% course', () => {
    const result = courseSummary(course([row()]))
    expect(result.earned).toBe(16)
    expect(result.total).toBe(100)
    expect(result.weightsComplete).toBe(false)
  })
  it('keeps zero score, zero weight and pending score distinct', () => {
    const input = course([row({ grade: 0, weight: 50 }), row({ id: 'b', grade: 10, weight: 0 }), row({ id: 'c', grade: null, weight: 50 })])
    const result = courseSummary(input)
    expect(result.hasWeights).toBe(true)
    expect(result.current).toBe(0)
    expect(result.earned).toBe(0)
    expect(result.gradedCount).toBe(2)
    expect(result.ungraded).toBe(50)
  })
  it('does not silently drop a graded score with an unreadable maximum from the average', () => {
    const input = course([row({ weight: 50 }), row({ id: 'b', gradeMax: null, weight: 50 })])
    expect(courseSummary(input).current).toBeNull()
    expect(gradeBreakdown(input).hiddenWeight).toBe(50)
    expect(percentage(row({ gradeMax: null }))).toBeNull()
  })
  it('rejects overcounted weights and non-finite API values', () => {
    expect(courseSummary(course([row({ weight: 100 }), row({ weight: 100 })])).hasWeights).toBe(false)
    expect(courseSummary(course([row({ weight: NaN })])).current).toBeNull()
    expect(percentage(row({ grade: Infinity }))).toBeNull()
  })
  it('retains Moodle published total separately from estimated earned points', () => {
    const result = courseSummary(course([row()], { earned: 75, max: 100 }))
    expect(result.earned).toBe(16)
    expect(result.reported).toBe(75)
  })
  it('keeps numbered gradebook activities as items rather than widget category rows', () => {
    expect(gradeBreakdown(course([row({ name: '1. Assignment', weight: 100 })])).earned).toBe(80)
  })

  const structureRow = (values: Partial<NonNullable<MoodleGradeCourse['assessmentStructure']>[number]> = {}): NonNullable<MoodleGradeCourse['assessmentStructure']>[number] => ({
    name: 'Quiz', url: null, isCategory: false, category: 'Quiz', categoryId: 1,
    weight: null, categoryWeight: null, gradeItemId: null, ...values,
  })
  it('removes scale results after category allocation without inflating numeric or pending shares', () => {
    const input = course([row({ weight: null }), row({ id: 'pass', grade: null, gradeMax: null, gradeText: 'Pass', gradeRange: 'Fail - Pass', weight: null }), row({ id: 'pending', grade: null, weight: null })])
    input.assessmentStructure = [structureRow({ isCategory: true, categoryWeight: 90 }),
      structureRow({ gradeItemId: 'a' }), structureRow({ gradeItemId: 'pass' }), structureRow({ gradeItemId: 'pending' })]
    expect(gradeItemWeights(input).get('a')).toBe(30)
    expect(gradeItemWeights(input).get('pending')).toBe(30)
    expect(gradeItemWeights(input).get('pass')).toBeNull()
    expect(courseSummary(input)).toMatchObject({ current: 80, earned: 24, gradedWeight: 30, ungraded: 30, hidden: 0 })
    expect(gradeBreakdown(input).categories[0].items.map((item) => item.id)).toEqual([0, 2])
  })
  it('splits widget category weights and keeps empty exams pending', () => {
    const input = course([row({ weight: null }), row({ id: 'b', grade: 0, weight: null })])
    input.assessmentStructure = [
      structureRow({ isCategory: true, categoryWeight: 9 }),
      structureRow({ gradeItemId: 'a' }), structureRow({ gradeItemId: 'b' }),
      structureRow({ name: 'Exam', category: 'Exam', isCategory: true, categoryId: 2, categoryWeight: 91 }),
    ]
    expect([...gradeItemWeights(input).values()]).toEqual([4.5, 4.5])
    expect(courseSummary(input)).toMatchObject({ hasWeights: true, weightsComplete: true, earned: 3.6, current: 40, ungraded: 91 })
    expect(gradeBreakdown(input).categories[1].items[0].placeholder).toBe(true)
  })
  it('preserves item title weights using the original Muster calculator', () => {
    const input = course([row({ weight: null }), row({ id: 'b', weight: null })])
    input.assessmentStructure = [structureRow({ isCategory: true, categoryWeight: 40 }),
      structureRow({ name: 'Paper (32%)', gradeItemId: 'a' }), structureRow({ gradeItemId: 'b' })]
    expect([...gradeItemWeights(input).values()]).toEqual([32, 8])
  })
  it('does not merge repeated category names with distinct IDs', () => {
    const input = course([row({ weight: null }), row({ id: 'b', grade: 5, weight: null })])
    input.assessmentStructure = [
      structureRow({ isCategory: true, categoryWeight: 30 }), structureRow({ gradeItemId: 'a' }),
      structureRow({ isCategory: true, categoryId: 2, categoryWeight: 70 }), structureRow({ categoryId: 2, gradeItemId: 'b' }),
    ]
    expect(gradeBreakdown(input).categories.map((category) => category.weight)).toEqual([30, 70])
    expect(courseSummary(input).earned).toBe(59)
  })
  it('keeps unmatched assessment links pending without reallocating their share', () => {
    const input = course([row({ weight: null })])
    input.assessmentStructure = [structureRow({ isCategory: true, categoryWeight: 100 }),
      structureRow({ gradeItemId: 'a' }), structureRow({ name: 'Unmatched link' })]
    expect(gradeItemWeights(input).get('a')).toBe(50)
    expect(courseSummary(input)).toMatchObject({ earned: 40, ungraded: 50, gradedCount: 1, count: 1 })
  })
  it('does not let extra gradebook rows erase the authoritative assessment breakdown', () => {
    const input = course([row({ weight: null }), row({ id: 'extra', weight: null })])
    input.assessmentStructure = [structureRow({ isCategory: true, categoryWeight: 100 }), structureRow({ gradeItemId: 'a' })]
    expect(courseSummary(input)).toMatchObject({ earned: 80, current: 80, weightsComplete: true })
    expect(gradeItemWeights(input).get('extra')).toBeNull()
  })
  it('retains letter grades as released but non-convertible weight', () => {
    const input = course([row({ grade: null, gradeText: 'HD', weight: 100 })])
    expect(isGradeReleased(input.items[0])).toBe(true)
    expect(courseSummary(input)).toMatchObject({ gradedCount: 1, ungradedCount: 0, current: null, hidden: 100, ungraded: 0 })
    expect(gradeBreakdown(input).hiddenWeight).toBe(100)
  })
  it('falls back to explicit gradebook weights when the assessment template has no usable weight', () => {
    const input = course([row()])
    input.assessmentStructure = [structureRow({ gradeItemId: 'a' })]
    expect(courseSummary(input).earned).toBe(16)
  })
  it('does not declare a gradebook complete while an extra pending item has unknown weight', () => {
    const input = course([row({ weight: 100 }), row({ id: 'b', grade: null, weight: null })])
    expect(courseSummary(input).weightsComplete).toBe(false)
  })
})
