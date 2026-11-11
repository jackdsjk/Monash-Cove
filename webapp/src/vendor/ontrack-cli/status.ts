// Adapted from bunizao/ontrack-cli src/status.ts at
// 04cee85a2351cc053e6e0ef2c33cdd4b44c3b1e4. MIT, Copyright (c) 2026 bunizao.
// Only read-only labels are ported; CLI dependencies and state writes are omitted.
const labels: Record<string, string> = {
  ready_for_feedback: 'Ready for Feedback',
  not_started: 'Not Started',
  working_on_it: 'Working On It',
  need_help: 'Need Help',
  redo: 'Redo',
  feedback_exceeded: 'Feedback Exceeded',
  fix_and_resubmit: 'Resubmit',
  discuss: 'Discuss',
  demonstrate: 'Demonstrate',
  complete: 'Complete',
  fail: 'Fail',
  time_exceeded: 'Time Exceeded',
  assess_in_portfolio: 'Assess in Portfolio',
  attention_required: 'Attention Required',
  rediscuss: 'Rediscuss',
}

export function statusLabel(key: string): string {
  return labels[key] ?? key
}
