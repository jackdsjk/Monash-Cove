import { describe, expect, it } from 'vitest'
import type { OnTrackCommentView, OnTrackTaskView } from '../types'
import { filterOnTrackTasks, onTrackGrade, onTrackStatus, onTrackTone, sortOnTrackComments } from './ontrack-tasks'

const task: OnTrackTaskView = {
  id: null, projectId: 1, taskDefinitionId: 1, unitCode: 'TEST1001', unitName: 'Fixture unit',
  abbreviation: '1.1P', name: 'First worksheet', description: 'Data modelling', status: 'not_instantiated',
  dueDate: null, targetDueDate: null, submissionDate: null, completionDate: null,
  weighting: null, timesAssessed: 0, numNewComments: 0,
}

describe('OnTrack local task browsing', () => {
  it('sorts numeric task identifiers naturally without mutating upstream order', () => {
    const tasks = ['10.1HD', '2.1D', '1.1P'].map((abbreviation) => ({ ...task, abbreviation }))
    expect(filterOnTrackTasks(tasks, { search: '', status: '', grade: '' }).map((item) => item.abbreviation))
      .toEqual(['1.1P', '2.1D', '10.1HD'])
    expect(tasks[0].abbreviation).toBe('10.1HD')
  })

  it('combines grade, status and case-insensitive text, retaining definitions and unknown states', () => {
    const pending = { ...task, abbreviation: '2.1HD', status: 'new_state', visibility: 'unknown' as const }
    const tasks = [task, pending, { ...pending, abbreviation: '3.1D' }]
    expect(filterOnTrackTasks(tasks, { search: ' MODELLING ', status: ' NEW_STATE ', grade: 'HD' })).toEqual([pending])
    expect(filterOnTrackTasks(tasks, { search: 'missing', status: '', grade: '' })).toEqual([])
    expect(onTrackGrade(pending)).toBe('HD')
    expect(onTrackGrade({ ...task, abbreviation: 'Preamble' })).toBe('—')
  })

  it('ports all read-only CLI statuses without treating unknown states as Complete', () => {
    expect(onTrackStatus('feedback_exceeded')).toBe('Feedback Exceeded')
    expect(onTrackStatus('fix_and_resubmit')).toBe('Resubmit')
    expect(onTrackStatus('ready_to_mark')).toBe('Ready to Mark')
    expect(onTrackStatus('not_instantiated')).toBe('尚未开始')
    expect(onTrackStatus('awaiting_review')).toBe('Awaiting review')
    expect(onTrackTone('fail')).toBe('red')
    expect(onTrackTone('awaiting_review')).toBe('slate')
  })

  it('keeps feedback chronological and invalid timestamps visible after dated feedback', () => {
    const comment = { type: 'comment', comment: 'Fixture feedback', authorId: null, authorName: '' }
    const comments: OnTrackCommentView[] = [
      { ...comment, id: 'unknown', createdAt: 'unknown' },
      { ...comment, id: 'later', createdAt: '2026-11-02T00:00:00Z' },
      { ...comment, id: 'first', createdAt: '2026-11-01T00:00:00Z' },
      { ...comment, id: 'empty', createdAt: '' },
    ]
    expect(sortOnTrackComments(comments).map((item) => item.id)).toEqual(['first', 'later', 'unknown', 'empty'])
    expect(comments[0].id).toBe('unknown')
  })
})
