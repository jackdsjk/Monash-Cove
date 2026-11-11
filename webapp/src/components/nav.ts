import type { Route } from '../lib/router'

export const NAV: { route: Route; label: string; group: 'main' | 'work' | 'system' }[] = [
  { route: '/', label: '自上次查看', group: 'main' },
  { route: '/deadlines', label: '截止时间', group: 'work' },
  { route: '/grades', label: '成绩', group: 'work' },
  { route: '/materials', label: '每周资料', group: 'work' },
  { route: '/ed', label: 'Ed 学习内容', group: 'work' },
  { route: '/pack', label: 'Moodle 作业资料', group: 'work' },
  { route: '/ontrack', label: 'OnTrack 任务', group: 'work' },
  { route: '/attendance', label: '考勤', group: 'work' },
  { route: '/sources', label: '来源', group: 'system' },
  { route: '/settings', label: '设置', group: 'system' },
]
