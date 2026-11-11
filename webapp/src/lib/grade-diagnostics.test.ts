import { expect, it } from 'vitest'
import type { MoodleGradeCourse } from '../types'
import { buildGradeDiagnosticReport } from './grade-diagnostics'

it('reports structure while excluding sensitive content even in errors and malformed text grades', () => {
  const input: MoodleGradeCourse = {
    courseId: 'private-course-987654', courseName: 'Student Name private@example.invalid',
    total: { earned: 73.125, max: 100 }, overviewGrade: '73.125 / 100',
    assessmentWarning: 'https://private.invalid/?token=secret-token', detailWarning: 'secret-token',
    items: [{ id: 'private-item', name: 'Private Essay', grade: 73.125, gradeMax: 100, weight: 30,
      feedback: 'Private feedback', gradedAt: 'Private date', gradeText: 'private@example.invalid' },
    { id: 'other', name: 'Secret', grade: null, gradeMax: null, weight: 70, gradingState: 'graded',
      gradeText: 'https://private.invalid/secret-token', feedback: '', gradedAt: null }],
  }
  const report = buildGradeDiagnosticReport([input])
  expect(report).toContain('items=2')
  expect(report).toContain('weightTotal=100')
  expect(report).toContain('"bare+max":1,"text":1')
  expect(report).not.toMatch(/private|secret|Student|Essay|feedback|73\.125|987654|https?:|@/i)
  expect(report).not.toContain('outcome=')
})
