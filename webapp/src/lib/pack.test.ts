import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPTIONS,
  MISSING_DATA,
  assignmentPackStatus,
  filterAssignmentPacks,
  toAssignmentPacks,
  toJSON,
  toMarkdown,
  type AssignmentPack,
} from './pack'
import type { PackAssignmentView, PackResponse } from '../types'

const NOW = Date.UTC(2026, 4, 16, 8, 0)
const HOUR = 3_600_000

function pack(over: Partial<AssignmentPack> = {}): AssignmentPack {
  return {
    id: 'fit2004-a2', courseId: '24', course: 'FIT2004', courseName: 'FIT2004_S2_2026',
    title: 'Assignment 2', dueAt: NOW + HOUR, completedAt: null,
    moodleUrl: 'https://moodle.example.invalid/mod/assign/view.php?id=123',
    spec: 'Submit a single file assignment2.py to Moodle.', rubric: null,
    changes: [{ field: '截止时间', before: '4:55 PM', after: '11:55 PM', at: NOW - HOUR, source: 'Moodle' }],
    ...over,
  }
}

function assignment(over: Partial<PackAssignmentView> = {}): PackAssignmentView {
  return {
    id: 'moodle:assignment:123', gradeItemId: 'grade-123', courseId: '24', course: 'FIT2004', courseName: 'FIT2004_S2_2026',
    sectionTitle: 'Assessment', title: 'Assignment 2',
    url: 'https://moodle.example.invalid/mod/assign/view.php?id=123', text: 'Moodle fixture specification',
    dueAt: new Date(NOW + HOUR).toISOString(), completedAt: null, updatedAt: new Date(NOW).toISOString(),
    changes: [], ...over,
  }
}

function payload(assignments: PackAssignmentView[]): PackResponse { return { rubric: null, assignments, verificationWarning: null } }

describe('Moodle-only assignment packs', () => {
  it('retains Grades-confirmed quizzes and rejects unverified submission portals', () => {
    const packs = toAssignmentPacks(payload([
      assignment({ id: 'quiz', url: 'https://moodle.example.invalid/mod/quiz/view.php?id=4' }),
      assignment({ id: 'practice', gradeItemId: '' }),
    ]))
    expect(packs.map((entry) => entry.id)).toEqual(['quiz'])
  })
  it('keeps full source IDs distinct and rejects task pages from other workflows', () => {
    const packs = toAssignmentPacks(payload([
      assignment({ id: 'moodle:assignment:123' }),
      assignment({ id: 'moodle:assignment:124' }),
      assignment({ id: 'ontrack-task', url: 'https://ontrack.example.invalid/#/projects/1/tasks/2' }),
      assignment({ id: 'invalid', url: 'broken' }),
    ]))
    expect(packs.map((entry) => entry.id)).toEqual(['moodle:assignment:123', 'moodle:assignment:124'])
    expect(new Set(packs.map((entry) => entry.id)).size).toBe(2)
  })

  it('does not carry legacy Ed posts through the adapter or either export format', () => {
    const legacy = {
      ...assignment(),
      posts: [{ id: 'ed-1', title: 'Legacy Ed topic', text: 'Private discussion body', authorRole: 'staff', publishedAt: new Date(NOW).toISOString(), url: 'https://edstem.org/fixture' }],
    }
    const packs = toAssignmentPacks(payload([legacy]))
    for (const result of [toMarkdown(packs, DEFAULT_OPTIONS, NOW), toJSON(packs, DEFAULT_OPTIONS, NOW)]) {
      expect(result).toContain('Moodle fixture specification')
      expect(result).not.toContain('Private discussion body')
      expect(result).not.toContain('edPosts')
      expect(result).not.toContain('https://edstem.org')
    }
  })

  it('retains completion evidence and uses null for an unknown due date', () => {
    const [result] = toAssignmentPacks(payload([assignment({ dueAt: 'invalid', completedAt: new Date(NOW).toISOString() })]))
    expect(result.dueAt).toBeNull()
    expect(result.completedAt).toBe(NOW)
  })
})

describe('assignment filters', () => {
  const entries = [
    pack(),
    pack({ id: 'overdue', dueAt: NOW - HOUR }),
    pack({ id: 'completed', dueAt: NOW - HOUR, completedAt: NOW - HOUR }),
    pack({ id: 'undated', dueAt: null }),
    pack({ id: 'other-semester', courseId: '25', courseName: 'FIT2004_S1_2026' }),
  ]
  const all = { courseId: '', status: 'all', query: '' } as const

  it('isolates semester-specific course IDs even when their course codes match', () => {
    expect(filterAssignmentPacks(entries, { ...all, courseId: '25' }, NOW).map((entry) => entry.id)).toEqual(['other-semester'])
  })

  it.each([
    ['upcoming', ['fit2004-a2', 'other-semester']],
    ['overdue', ['overdue']],
    ['completed', ['completed']],
    ['undated', ['undated']],
  ] as const)('filters %s without treating completed or undated work as overdue', (status, ids) => {
    expect(filterAssignmentPacks(entries, { ...all, status }, NOW).map((entry) => entry.id)).toEqual(ids)
  })

  it('combines a case-insensitive search with course and status and permits empty results', () => {
    expect(filterAssignmentPacks(entries, { courseId: '25', status: 'upcoming', query: '  fit2004_s1  ' }, NOW)).toHaveLength(1)
    expect(filterAssignmentPacks(entries, { ...all, query: 'nonexistent' }, NOW)).toEqual([])
    expect(assignmentPackStatus(pack({ dueAt: NOW }), NOW)).toBe('upcoming')
  })
})

describe('Moodle export', () => {
  it('exports the specification, missing rubric and associated Moodle changes', () => {
    const markdown = toMarkdown([pack()], DEFAULT_OPTIONS, NOW)
    expect(markdown).toContain('# FIT2004 · Assignment 2')
    expect(markdown).toContain('- 课程：FIT2004 · FIT2004_S2_2026')
    expect(markdown).toContain('## 作业要求（Moodle 原文）')
    expect(markdown).toContain('Submit a single file assignment2.py to Moodle.')
    expect(markdown).toContain('## 评分标准')
    expect(markdown).toContain(MISSING_DATA)
    expect(markdown).toContain('- 截止时间：4:55 PM → 11:55 PM（Moodle')
  })

  it('omits unchecked sections in both formats', () => {
    const opts = { spec: false, rubric: false, changes: false }
    const markdown = toMarkdown([pack()], opts, NOW)
    expect(markdown).not.toContain('作业要求（Moodle 原文）')
    expect(markdown).not.toContain('评分标准')
    expect(markdown).not.toContain('## 变更记录')
    const output = JSON.parse(toJSON([pack()], opts, NOW))
    expect(output.assignments[0]).not.toHaveProperty('specification')
    expect(output.assignments[0]).not.toHaveProperty('rubric')
    expect(output.assignments[0]).not.toHaveProperty('changes')
  })

  it('names every Moodle assignment when exporting multiple results', () => {
    const markdown = toMarkdown([pack(), pack({ id: 'other', course: 'FIT3155', title: 'Assignment 2 — BWT' })], DEFAULT_OPTIONS, NOW)
    expect(markdown).toContain('# Moodle 作业资料（2 项作业）')
    expect(markdown).toContain('## FIT2004 · Assignment 2')
    expect(markdown).toContain('## FIT3155 · Assignment 2 — BWT')
  })

  it('reports missing dates and specifications without inventing data', () => {
    const markdown = toMarkdown([pack({ dueAt: null, spec: '   ' })], DEFAULT_OPTIONS, NOW)
    expect(markdown).toContain(`- 截止时间：${MISSING_DATA}`)
    expect(markdown).toContain(MISSING_DATA)
  })
})
