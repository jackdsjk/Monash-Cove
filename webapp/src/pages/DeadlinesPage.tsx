import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useStore } from '../store'
import { fetchBrief, fetchPortalExams, PortalExamsError, setItemCompleted, syncPortalExams } from '../data/repository'
import type { Item } from '../data/model'
import type { PortalExam } from '../types'
import { fmtCountdown, fmtDue, fmtWhen } from '../lib/time'
import { Button, Course, DuePill, EmptyLine, PageTitle, Panel, SectionHeader, Source, Tag } from '../components/ui'

const H = 3600_000
const COLS = 'grid-cols-[180px_110px_76px_84px_minmax(0,1fr)_110px]'
const EXAM_COLS = 'grid-cols-[88px_minmax(0,1fr)_224px_minmax(0,190px)_76px_96px]'
const WEEKDAY: Record<string, string> = {
  Sun: '周日',
  Mon: '周一',
  Tue: '周二',
  Wed: '周三',
  Thu: '周四',
  Fri: '周五',
  Sat: '周六',
}

/** 考试时间必须按门户给的时区显示，而不是浏览器本地时区。 */
function examTime(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms))
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  const hour = pick('hour') === '24' ? '00' : pick('hour')
  return `${Number(pick('month'))}月${Number(pick('day'))}日 ${WEEKDAY[pick('weekday')] ?? pick('weekday')} ${hour}:${pick('minute')}`
}

/** "Asia/Kuala_Lumpur" → "Kuala Lumpur"；完整 IANA 名放在 title 里。 */
function timezoneLabel(timeZone: string) {
  return (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ')
}

function durationLabel(minutes: number | null) {
  if (!minutes) return '—'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`
}

export function DeadlinesPage() {
  const { items, now, marks, openItem, setMark } = useStore()
  const [completed, setCompleted] = useState<Record<string, boolean>>({})

  const [exams, setExams] = useState<PortalExam[]>([])
  const [examsSyncedAt, setExamsSyncedAt] = useState<string | null>(null)
  const [examsConnected, setExamsConnected] = useState<boolean | null>(null)
  const [examsReady, setExamsReady] = useState(false)
  const [examsSyncing, setExamsSyncing] = useState(false)
  const [examsError, setExamsError] = useState<string | null>(null)
  const [examsNotice, setExamsNotice] = useState<string | null>(null)

  // 已提交以本地服务的 completed_at 为准；服务不可用时退回本地标记，不展示推断结果。
  useEffect(() => {
    let active = true
    void fetchBrief()
      .then(({ items: brief }) => {
        if (!active) return
        const next: Record<string, boolean> = {}
        for (const item of brief) next[item.id] = Boolean(item.completedAt)
        setCompleted(next)
      })
      .catch(() => {
        /* 读不到就沿用本地标记 */
      })
    return () => {
      active = false
    }
  }, [])

  const refreshExams = useCallback(async () => {
    setExamsError(null)
    try {
      const data = await fetchPortalExams()
      setExams(data.exams)
      setExamsSyncedAt(data.syncedAt)
      setExamsConnected(data.connected)
    } catch (cause) {
      setExamsError(cause instanceof Error ? cause.message : '读取考试时间表失败')
    } finally {
      setExamsReady(true)
    }
  }, [])

  useEffect(() => {
    void refreshExams()
  }, [refreshExams])

  const syncExams = async () => {
    if (examsSyncing) return
    setExamsSyncing(true)
    setExamsError(null)
    setExamsNotice(null)
    try {
      const { count } = await syncPortalExams()
      await refreshExams()
      setExamsNotice(count === 0 ? '门户这次没有返回考试安排' : `已同步 ${count} 场考试`)
    } catch (cause) {
      // 未登录是可预期的状态，不当成错误；连接流程另有入口。
      if (cause instanceof PortalExamsError && cause.code === 'portal_not_connected') {
        setExamsConnected(false)
      } else {
        setExamsError(cause instanceof Error ? cause.message : '同步考试时间表失败')
      }
    } finally {
      setExamsSyncing(false)
    }
  }

  const withDue = items.filter((i) => i.dueAt).sort((a, b) => a.dueAt! - b.dueAt!)

  const groups: { title: string; list: Item[] }[] = [
    { title: '已截止', list: withDue.filter((i) => i.dueAt! <= now).reverse() },
    { title: '24 小时内', list: withDue.filter((i) => i.dueAt! > now && i.dueAt! - now <= 24 * H) },
    { title: '7 天内', list: withDue.filter((i) => i.dueAt! - now > 24 * H && i.dueAt! - now <= 7 * 24 * H) },
    { title: '更晚', list: withDue.filter((i) => i.dueAt! - now > 7 * 24 * H) },
  ]

  const isSubmitted = (id: string) => Boolean(marks[id]?.submitted) || Boolean(completed[id])

  const toggleSubmitted = (id: string, next: boolean) => {
    const previous = isSubmitted(id)
    setMark(id, { submitted: next ? true : undefined })
    setCompleted((prev) => ({ ...prev, [id]: next }))
    void setItemCompleted(id, next ? true : null).catch(() => {
      setMark(id, { submitted: previous ? true : undefined })
      setCompleted((prev) => ({ ...prev, [id]: previous }))
    })
  }

  const examHint =
    examsNotice ??
    ([
      examsSyncedAt ? `上次同步 ${fmtWhen(Date.parse(examsSyncedAt))}` : null,
      examsConnected === false && exams.length > 0 ? '门户未连接，显示上次同步结果' : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · ') || '来自 Monash 学生门户（不是 Moodle）')

  return (
    <div className="mx-auto max-w-[1240px] px-10 py-8">
      <PageTitle title="截止时间" description={`共 ${withDue.length} 项有结构化截止时间。没有结构化截止时间的条目不显示。`} />
      <div className="space-y-8">
        <section>
          <SectionHeader
            title="考试"
            count={exams.length}
            hint={examHint}
            right={
              <Button size="sm" onClick={() => void syncExams()} disabled={examsSyncing} aria-busy={examsSyncing}>
                <RefreshCw className={examsSyncing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                {examsSyncing ? '同步中…' : '同步考试'}
              </Button>
            }
          />
          <Panel className="overflow-hidden">
            {!examsReady ? (
              <p className="px-5 py-4 text-sm text-slate-500">正在读取考试安排…</p>
            ) : exams.length > 0 ? (
              <>
                {examsError && (
                  <div className="flex items-start gap-2 border-b border-line bg-red-50/60 px-5 py-2.5 text-[13px] text-red-700">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{examsError}</span>
                  </div>
                )}
                <div
                  className={`grid ${EXAM_COLS} gap-3 border-b border-line bg-slate-50/70 px-5 py-2.5 text-xs font-medium text-slate-500`}
                >
                  <span>课程</span>
                  <span>考试</span>
                  <span>日期时间</span>
                  <span>地点</span>
                  <span>座位</span>
                  <span>时长</span>
                </div>
                <div className="divide-y divide-line">
                  {exams.map((exam) => {
                    const past = exam.endMs < now
                    return (
                      <div
                        key={exam.id}
                        className={`grid ${EXAM_COLS} items-center gap-3 px-5 py-3 text-sm ${
                          past ? 'text-slate-500' : 'text-slate-800'
                        }`}
                      >
                        <Course code={exam.courseCode} />
                        <span className="min-w-0 truncate font-medium" title={exam.title}>
                          {exam.title}
                        </span>
                        <span className="min-w-0">
                          <span className="block whitespace-nowrap">{examTime(exam.startMs, exam.timezone)}</span>
                          <span className="block truncate text-xs text-slate-500" title={exam.timezone}>
                            {timezoneLabel(exam.timezone)}
                          </span>
                        </span>
                        <span className="truncate" title={exam.location || undefined}>
                          {exam.location || '—'}
                        </span>
                        <span>
                          {exam.seat ? <Tag tone="brand">{exam.seat}</Tag> : <span className="text-slate-400">—</span>}
                        </span>
                        <span className="whitespace-nowrap text-slate-600">{durationLabel(exam.durationMin)}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : examsError ? (
              <div className="px-5 py-6">
                <p className="text-sm font-semibold text-slate-900">没能读到考试时间表</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{examsError}</p>
                <Button size="sm" className="mt-3" onClick={() => void refreshExams()}>
                  重试
                </Button>
              </div>
            ) : examsConnected === false ? (
              <div className="px-5 py-6">
                <p className="text-sm font-semibold text-slate-900">还没连接学生门户</p>
                <p className="mt-1.5 max-w-[76ch] text-[13px] leading-relaxed text-slate-600">
                  考试时间表来自 Monash 学生门户（home.student.monash），不是 Moodle。需要先用 Monash 账号在这个门户登录一次，
                  登录后回到这里点「同步考试」。连接入口不在此页面，先只做说明。
                </p>
              </div>
            ) : (
              <EmptyLine>
                {examsSyncedAt ? '上次同步没有找到考试安排。' : '学生门户已连接，但还没同步过。点「同步考试」读取时间表。'}
              </EmptyLine>
            )}
          </Panel>
        </section>

        {groups.map((g) => (
          <section key={g.title}>
            <SectionHeader title={g.title} count={g.list.length} />
            <Panel className="overflow-hidden">
              {g.list.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">无</p>
              ) : (
                <div className="divide-y divide-line">
                  {g.list.map((i) => {
                    const submitted = isSubmitted(i.id)
                    return (
                      <div key={i.id} className={`grid items-center gap-3 px-5 py-3 text-sm hover:bg-brand-50/50 ${COLS} ${submitted ? 'text-slate-500' : 'text-slate-800'}`}>
                        <span>{fmtDue(i.dueAt!)}</span>
                        <span className="flex items-center gap-2">
                          <DuePill due={i.dueAt!} now={now} />
                          <span className="sr-only">{fmtCountdown(i.dueAt!, now)}</span>
                        </span>
                        <Course code={i.course} />
                        <Source id={i.source} />
                        <button onClick={() => openItem(i.id)} className="truncate text-left hover:text-brand-700 hover:underline">
                          {i.title}
                        </button>
                        <span className="flex justify-end">
                          {submitted ? (
                            <button onClick={() => toggleSubmitted(i.id, false)} title="撤销已提交标记">
                              <Tag tone="green">已提交</Tag>
                            </button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => toggleSubmitted(i.id, true)}>
                              标记已提交
                            </Button>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>
          </section>
        ))}
      </div>
    </div>
  )
}
