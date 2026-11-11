import { describe, expect, it } from 'vitest'
import type { MoodleGradeCourse, MoodleGradeItem } from '../types'
import { courseSummary, gradeBreakdown, percentage } from './grades'

const row = (values: Partial<MoodleGradeItem> = {}): MoodleGradeItem => ({
  id: 'a', name: 'Assessment', grade: 8, gradeMax: 10, weight: 20,
  feedback: '', gradedAt: null, ...values,
})
const course = (items: MoodleGradeItem[], total: MoodleGradeCourse['total'] = { earned: null, max: null }): MoodleGradeCourse => ({
  courseId: '1', courseName: 'TEST101 Fixture', items, total,
})

describe('Moodle to Muster grade adapter', () => {
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
    expect(result.hasWeights).toBe(false)
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
})
