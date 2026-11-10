import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPTIONS,
  MISSING_DATA,
  selectPosts,
  toMarkdown,
  type AssignmentPack,
  type PackPost,
} from './pack'

const NOW = Date.UTC(2026, 4, 16, 8, 0)
const HOUR = 3_600_000
const before = (hours: number) => NOW - hours * HOUR

function post(over: Partial<PackPost> = {}): PackPost {
  return {
    id: 'post-1',
    number: 598,
    title: 'A2 deadline moved to 11:55pm',
    category: '',
    author: '',
    role: 'staff',
    at: before(1),
    body: 'The submission cut-off has been updated.',
    url: 'https://edstem.org/au/courses/16411/discussion/598',
    replies: [],
    ...over,
  }
}

const staffPost = post({ id: 'staff', role: 'staff', title: 'A2 deadline moved to 11:55pm' })
const studentPost = post({ id: 'student', role: 'student', title: 'Can we use heapq?' })
const studentQuestion = post({
  id: 'mixed',
  role: 'student',
  title: 'Is heapq allowed?',
  replies: [
    { author: 'Ravi', role: 'student', at: before(3), body: 'I think heapq is fine.' },
    { author: 'Kevin', role: 'staff', at: before(2), body: 'Only without decrease-key.' },
  ],
})

function pack(over: Partial<AssignmentPack> = {}): AssignmentPack {
  return {
    id: 'fit2004-a2',
    course: 'FIT2004',
    courseName: 'FIT2004_S2_2026',
    title: 'Assignment 2',
    dueAt: Date.UTC(2026, 4, 16, 15, 55),
    moodleUrl: 'https://learning.monash.edu/mod/assign/view.php?id=3920144',
    spec: 'Submit a single file assignment2.py to Moodle.',
    rubric: null,
    changes: [{ field: '截止时间', before: '4:55 PM', after: '11:55 PM', at: before(0.7), source: 'Moodle' }],
    posts: [],
    ...over,
  }
}

describe('selectPosts', () => {
  it('keeps only staff content, including posts that carry a staff reply, when student posts are off', () => {
    const selected = selectPosts(pack({ posts: [staffPost, studentPost, studentQuestion] }), {
      ...DEFAULT_OPTIONS,
      studentPosts: false,
    })

    expect(selected.map((p) => p.id)).toEqual(['staff', 'mixed'])
    expect(selected[1].replies.map((r) => r.role)).toEqual(['staff'])
  })

  it('drops every post that contains staff content when staff posts are off', () => {
    const selected = selectPosts(pack({ posts: [staffPost, studentPost, studentQuestion] }), {
      ...DEFAULT_OPTIONS,
      staffPosts: false,
    })

    expect(selected.map((p) => p.id)).toEqual(['student'])
    expect(selected[0].replies).toEqual([])
  })

  it('returns every post and reply when both roles are on', () => {
    const selected = selectPosts(pack({ posts: [staffPost, studentPost, studentQuestion] }), DEFAULT_OPTIONS)

    expect(selected).toHaveLength(3)
    expect(selected[2].replies).toHaveLength(2)
  })
})

describe('toMarkdown', () => {
  it('exports the specification, missing rubric, changes and Ed posts with role labels', () => {
    const markdown = toMarkdown([pack({ posts: [staffPost, studentPost] })], DEFAULT_OPTIONS, NOW)

    expect(markdown).toContain('# FIT2004 · Assignment 2')
    expect(markdown).toContain('- 课程：FIT2004 · FIT2004_S2_2026')
    expect(markdown).toContain('## 作业要求（Moodle 原文）')
    expect(markdown).toContain('Submit a single file assignment2.py to Moodle.')
    expect(markdown).toContain('## 评分标准')
    expect(markdown).toContain(MISSING_DATA)
    expect(markdown).toContain('- 截止时间：4:55 PM → 11:55 PM（Moodle')
    expect(markdown).toContain('## Ed 帖子（2）')
    expect(markdown).toContain('### #598 A2 deadline moved to 11:55pm')
    expect(markdown).toContain('- 作者：教学人员')
    expect(markdown).toContain('### #598 Can we use heapq?')
    expect(markdown).toContain('- 作者：学生')
  })

  it('omits unchecked sections and student posts', () => {
    const markdown = toMarkdown(
      [pack({ posts: [staffPost, studentPost] })],
      { ...DEFAULT_OPTIONS, spec: false, rubric: false, changes: false, studentPosts: false },
      NOW,
    )

    expect(markdown).not.toContain('作业要求（Moodle 原文）')
    expect(markdown).not.toContain('评分标准')
    expect(markdown).not.toContain('变更记录')
    expect(markdown).not.toContain('Can we use heapq?')
    expect(markdown).toContain('## Ed 帖子（1）')
  })

  it('names every pack when more than one assignment is exported', () => {
    const markdown = toMarkdown([pack(), pack({ id: 'fit3155-a2', course: 'FIT3155', title: 'Assignment 2 — BWT' })], DEFAULT_OPTIONS, NOW)

    expect(markdown).toContain('# 作业资料包（2 项作业）')
    expect(markdown).toContain('## FIT2004 · Assignment 2')
    expect(markdown).toContain('## FIT3155 · Assignment 2 — BWT')
    expect(markdown).toContain('\n---\n')
  })

  it('says the data is missing instead of inventing a due date or specification', () => {
    const markdown = toMarkdown([pack({ dueAt: null, spec: '   ', posts: [] })], DEFAULT_OPTIONS, NOW)

    expect(markdown).toContain(`- 截止时间：${MISSING_DATA}`)
    expect(markdown).toContain(MISSING_DATA)
    expect(markdown).not.toContain('Ed 帖子（')
  })
})
