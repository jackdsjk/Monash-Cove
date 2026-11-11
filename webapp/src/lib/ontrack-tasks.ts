import type { OnTrackCommentView, OnTrackTaskView } from '../types'
import { statusLabel } from '../vendor/ontrack-cli/status'

export function onTrackGrade(task: OnTrackTaskView): string {
  return /(HD|[PCD])$/i.exec(task.abbreviation.trim())?.[1].toUpperCase() ?? '—'
}

export function onTrackStatus(status: string): string {
  if (status === 'not_instantiated') return '尚未开始'
  if (status === 'ready_to_mark') return 'Ready to Mark'
  const label = statusLabel(status)
  if (label !== status) return label
  const text = status.replace(/_/g, ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '—'
}

export function onTrackTone(status: string): 'slate' | 'brand' | 'green' | 'amber' | 'red' {
  if (status === 'complete') return 'green'
  if (['fail', 'redo', 'time_exceeded', 'feedback_exceeded', 'attention_required'].includes(status)) return 'red'
  if (['fix_and_resubmit', 'discuss', 'rediscuss', 'demonstrate', 'need_help', 'assess_in_portfolio'].includes(status)) return 'amber'
  if (['working_on_it', 'ready_for_feedback', 'ready_to_mark'].includes(status)) return 'brand'
  return 'slate'
}

/** Filters local task definitions without altering applicability or completion. */
export function filterOnTrackTasks(tasks: OnTrackTaskView[], filters: { search: string; status: string; grade: string }): OnTrackTaskView[] {
  const query = filters.search.trim().toLocaleLowerCase()
  return tasks.filter((task) =>
    (!filters.status || task.status.toLowerCase() === filters.status.trim().toLowerCase()) &&
    (!filters.grade || onTrackGrade(task) === filters.grade) &&
    (!query || [task.unitCode, task.unitName, task.abbreviation, task.name, task.description, onTrackStatus(task.status)]
      .some((value) => value.toLocaleLowerCase().includes(query))))
    .sort((a, b) => a.unitCode.localeCompare(b.unitCode, undefined, { numeric: true }) ||
      a.abbreviation.localeCompare(b.abbreviation, undefined, { numeric: true, sensitivity: 'base' }) ||
      a.taskDefinitionId - b.taskDefinitionId)
}

/** Keep invalid dates visible, after dated comments; never mutate the API result. */
export function sortOnTrackComments(comments: OnTrackCommentView[]): OnTrackCommentView[] {
  const at = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : Infinity
  return [...comments].sort((a, b) => {
    const left = at(a.createdAt), right = at(b.createdAt)
    return left === right ? 0 : left < right ? -1 : 1
  })
}
