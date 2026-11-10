import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, RefreshCw, ShieldAlert, Wand2 } from 'lucide-react'
import {
  cancelAttendanceAssistant,
  fetchAttendanceAssistant,
  fetchAttendanceCodes,
  fetchAttendanceStatus,
  fillAllAttendanceCodes,
  fillAttendanceCode,
  startAttendanceAssistant,
  submitAttendanceCodes,
} from '../data/repository'
import type { AttendanceAssistantState, AttendanceCode, AttendanceSubmitSummary } from '../types'
import { useTime } from '../lib/time'
import { Button, EmptyLine, PageTitle, Panel, Tag } from '../components/ui'
import { AttendanceSubmitDialog } from '../components/AttendanceSubmitDialog'

const COLS = 'min-w-[1000px] grid-cols-[80px_100px_190px_minmax(0,1fr)_230px_190px]'

/** fill-all 每个 code 都要新开一次浏览器；一次请求里塞太多会被 20s 客户端超时截断 */
const BULK_CHUNK = 3

function endOfWeek(now: number) {
  const d = new Date(now)
  const toSunday = (7 - d.getDay()) % 7
  d.setDate(d.getDate() + toSunday)
  d.setHours(23, 59, 0, 0)
  return d.getTime()
}

function startOfWeek(now: number) {
  const d = new Date(now)
  const toMonday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - toMonday)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function sourceLabel(source: string) {
  if (source === 'gmail') return 'Gmail'
  if (source === 'moodle') return 'Moodle'
  if (source === 'ed') return 'Ed'
  return source
}

export function AttendancePage() {
  const { fmtDue, fmtWhen } = useTime()
  const [now, setNow] = useState(() => Date.now())
  const [codes, setCodes] = useState<AttendanceCode[]>([])
  const [connected, setConnected] = useState(false)
  const [assistant, setAssistant] = useState<AttendanceAssistantState>({ status: 'idle', message: '' })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState<AttendanceCode[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const weekEnd = endOfWeek(now)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const load = useCallback(async (refresh = false) => {
    const [status, result] = await Promise.all([fetchAttendanceStatus(), fetchAttendanceCodes(refresh)])
    setConnected(status.connected)
    setAssistant(status.assistant)
    setCodes(result.codes)
  }, [])

  useEffect(() => {
    let active = true
    void load()
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '无法读取考勤数据')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [load])

  useEffect(() => {
    if (assistant.status !== 'waiting_login') return
    const timer = window.setInterval(() => {
      void fetchAttendanceAssistant()
        .then((next) => {
          setAssistant(next)
          if (next.status === 'connected') {
            setNotice('Attendance 已连接，可以填写了。')
            void load().catch(() => undefined)
          }
        })
        .catch(() => undefined)
    }, 1_500)
    return () => window.clearInterval(timer)
  }, [assistant.status, load])

  const connect = async () => {
    setStarting(true)
    setError(null)
    try {
      setAssistant(await startAttendanceAssistant())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法启动 Attendance 登录')
    } finally {
      setStarting(false)
    }
  }

  const cancelConnect = async () => {
    try {
      setAssistant(await cancelAttendanceAssistant())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法取消登录')
    }
  }

  const refresh = async () => {
    setRefreshing(true)
    setError(null)
    try {
      await load(true)
      setNotice('已重新读取考勤代码。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '刷新考勤代码失败')
    } finally {
      setRefreshing(false)
    }
  }

  const publishedAt = (code: AttendanceCode) => {
    const parsed = Date.parse(code.publishedAt)
    return Number.isNaN(parsed) ? now : parsed
  }

  const codeOf = (code: AttendanceCode) => drafts[code.id] ?? code.code

  /** 每个 code 的填写窗口只到它自己那一周的周日，跨周的旧 code 不能一直可填 */
  const deadlineOf = (code: AttendanceCode) => endOfWeek(publishedAt(code))

  const isOpen = (code: AttendanceCode) => now >= publishedAt(code) && now <= deadlineOf(code)

  const weekCount = codes.filter((code) => publishedAt(code) >= startOfWeek(now)).length
  const fillable = codes.filter((code) => isOpen(code) && !code.filledAt)
  const fillableWithCode = fillable.filter((code) => codeOf(code).length >= 4)
  const missingCode = fillable.filter((code) => codeOf(code).length < 4)
  const filled = codes.filter((code) => code.filledAt)
  const closed = codes.filter((code) => !isOpen(code) && !code.filledAt)

  const stats: Array<[string, number, string]> = [
    ['已填写', filled.length, 'text-emerald-700'],
    ['可填写', fillableWithCode.length, 'text-brand-700'],
    ['未开放', closed.length, 'text-slate-900'],
    ['没有识别到代码', missingCode.length, 'text-amber-700'],
  ]

  /**
   * 真提交。不重试、不猜测结果：后端逐条返回，界面逐条展示；
   * 请求本身失败时把「未知」如实抛给弹窗，绝不写成成功。
   */
  const submit = async (items: AttendanceCode[]): Promise<AttendanceSubmitSummary> => {
    setBusy(true)
    setError(null)
    try {
      const summary = await submitAttendanceCodes(items.map((item) => ({ ...item, code: codeOf(item) })))
      const accepted = new Set(
        items
          .filter((item) =>
            summary.results.some((entry) => entry.status === 'submitted' && entry.code === codeOf(item)),
          )
          .map((item) => item.id),
      )
      setDrafts((prev) => {
        const next = { ...prev }
        for (const id of accepted) delete next[id]
        return next
      })
      setNotice(
        summary.failed > 0
          ? `提交完成：${summary.submitted} 项成功，${summary.failed} 项失败。失败原因见弹窗。`
          : `已提交 ${summary.submitted} 项，门户已确认。`,
      )
      return summary
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '提交失败，结果未知'
      setError(message)
      throw cause
    } finally {
      setBusy(false)
      void load().catch(() => undefined)
    }
  }

  const applyFill = async (items: AttendanceCode[]) => {
    if (items.length === 0) return
    setBusy(true)
    setError(null)
    let summary = ''
    let failure: string | null = null
    try {
      if (items.length === 1) {
        const item = items[0]
        const result = await fillAttendanceCode({ ...item, code: codeOf(item) })
        if (result.status === 'filled') {
          summary = result.message || `已填入 ${item.course} ${item.session} 的考勤代码，尚未提交。`
        } else {
          failure = result.message || (result.status === 'inactive' ? '当前没有打开的考勤表单。' : '没有在 Attendance 页面找到对应活动。')
        }
      } else {
        let filledCount = 0
        let inactiveCount = 0
        let notFoundCount = 0
        for (let index = 0; index < items.length; index += BULK_CHUNK) {
          const chunk = items.slice(index, index + BULK_CHUNK)
          try {
            const result = await fillAllAttendanceCodes(chunk.map((c) => ({ ...c, code: codeOf(c) })))
            filledCount += result.filled
            inactiveCount += result.inactive
            notFoundCount += result.notFound
          } catch (cause) {
            const handled = filledCount + inactiveCount + notFoundCount
            const reason = cause instanceof Error ? cause.message : '填写失败'
            failure = handled > 0 ? `已处理 ${handled} 项后中断：${reason}` : reason
            break
          }
        }
        const extra = [inactiveCount ? `${inactiveCount} 项当前不可填` : '', notFoundCount ? `${notFoundCount} 项未找到` : '']
          .filter(Boolean)
          .join('，')
        summary = `已填写 ${filledCount} 项，尚未提交。` + (extra ? `另有${extra}。` : '')
        if (filledCount === 0 && !failure) {
          failure = extra ? `没有填写成功：另有${extra}。` : '后端没有填写任何一项，请确认 Attendance 已连接、当前有打开的考勤表单。'
        }
      }
      setConfirming(null)
      if (failure) {
        // 失败时保留用户手动改过的 code，方便直接重试
        setError(failure)
      } else {
        setDrafts((prev) => {
          const next = { ...prev }
          for (const item of items) delete next[item.id]
          return next
        })
        setNotice(summary)
      }
    } catch (cause) {
      setConfirming(null)
      setError(cause instanceof Error ? cause.message : '填写考勤失败')
    } finally {
      setBusy(false)
      // 后端可能已经写入了一部分；重新读取真实状态，不用本地草稿假装成功
      void load().catch(() => undefined)
    }
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <PageTitle
        title="考勤"
        description={`本周 ${weekCount} 个班次（共 ${codes.length} 个代码）。上课开始后开放填写，截止到 ${fmtDue(weekEnd)}。`}
        actions={
          <>
            <Button onClick={() => void refresh()} disabled={refreshing || loading}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              刷新代码
            </Button>
            <Button
              variant="primary"
              onClick={() => setConfirming(fillableWithCode)}
              disabled={fillableWithCode.length === 0 || busy || !connected}
              title={!connected ? '先连接 Attendance' : undefined}
            >
              <Wand2 className="h-4 w-4" />
              一键填写本周{fillableWithCode.length ? `（${fillableWithCode.length}）` : ''}
            </Button>
          </>
        }
      />

      <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-2.5 text-[13px]">
        <span className="flex min-w-0 items-center gap-2 text-slate-700">
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          <span className="font-medium">{connected ? 'Attendance 已连接' : 'Attendance 未连接'}</span>
          <span className="truncate text-slate-500">
            {assistant.status === 'waiting_login'
              ? '请在打开的 Chrome 窗口完成 Monash 登录'
              : assistant.status === 'error'
                ? assistant.message
                : connected
                  ? 'session 保存在本机，过期后需要重新连接。'
                  : '填写前需要先连接考勤门户。'}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {assistant.status === 'waiting_login' ? (
            <Button size="sm" onClick={() => void cancelConnect()}>
              取消登录
            </Button>
          ) : (
            <Button
              size="sm"
              variant={connected ? 'secondary' : 'primary'}
              disabled={starting}
              onClick={() => void connect()}
            >
              {starting ? '正在启动…' : connected ? '重新连接' : '连接 Attendance'}
            </Button>
          )}
        </span>
      </div>

      <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-[13px] text-brand-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
        <p>
          这是 Cove 唯一会写入学校系统的操作。「只填不提交」只把代码放进考勤表单，不点击提交；
          <strong className="font-semibold">「提交」会真的提交到考勤门户，提交后不可撤销，代码错误或班次不对可能被记为旷课</strong>。
          每一次操作都要你先核对班次、再手动确认，Cove 不会自动提交，也不会记住「以后自动提交」。
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map(([label, value, tone]) => (
          <div key={label} className="rounded-2xl border border-line bg-white px-5 py-4">
            <p className="text-[13px] font-medium text-slate-600">{label}</p>
            <p className={`mt-1.5 text-[26px] leading-none font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      {(error || notice) && (
        <div
          role="status"
          className={`mb-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-[13px] ${
            error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          <span className="flex items-center gap-2">
            {error ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {error ?? notice}
          </span>
          <button
            onClick={() => {
              setError(null)
              setNotice(null)
            }}
            className="text-xs font-medium hover:underline"
          >
            知道了
          </button>
        </div>
      )}

      <Panel className="overflow-x-auto">
        <div className={`grid ${COLS} gap-3 border-b border-line bg-slate-50/70 px-5 py-2.5 text-xs font-medium text-slate-500`}>
          <span>课程</span>
          <span>班次</span>
          <span>时间</span>
          <span>地点</span>
          <span>考勤代码</span>
          <span className="text-right">状态</span>
        </div>
        <ul className="divide-y divide-line">
          {loading ? (
            <li>
              <EmptyLine>正在读取考勤代码…</EmptyLine>
            </li>
          ) : codes.length === 0 ? (
            <li>
              <EmptyLine>还没有识别到考勤代码。先同步 Gmail 或 Moodle。</EmptyLine>
            </li>
          ) : (
            codes.map((code) => {
              const open = isOpen(code)
              const value = codeOf(code)
              const published = publishedAt(code)
              return (
                <li
                  key={code.id}
                  className={`grid ${COLS} items-center gap-3 px-5 py-3 text-sm ${!open && !code.filledAt ? 'text-slate-500' : ''}`}
                >
                  <span className="font-semibold text-slate-800">{code.course}</span>
                  <span className="text-slate-700">{code.session}</span>
                  <span className="text-slate-700">
                    Week {code.week} · {fmtWhen(published, now)}
                    {open && !code.filledAt && <span className="block text-[11px] font-medium text-brand-700">本周可填</span>}
                  </span>
                  <span className="truncate text-slate-400" title="本地 API 没有提供教室信息">
                    —
                  </span>
                  <span className="min-w-0">
                    {code.filledAt ? (
                      <span className="font-mono text-[13px] text-slate-800">{code.code}</span>
                    ) : (
                      <>
                        <input
                          aria-label={`${code.course} ${code.session} 考勤代码`}
                          disabled={!open}
                          value={value}
                          onChange={(e) =>
                            setDrafts({ ...drafts, [code.id]: e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 8) })
                          }
                          placeholder={open ? '输入代码' : '未开放'}
                          className="h-8 w-32 rounded-lg border border-line bg-white px-2.5 font-mono text-[13px] tracking-wider outline-none focus:border-brand-500 disabled:bg-slate-50"
                        />
                        {open && (
                          <span
                            className={`mt-1 block truncate text-[11px] ${
                              value === code.code ? 'text-brand-700' : 'text-slate-500'
                            }`}
                          >
                            代码来自 {sourceLabel(code.source)}
                            {code.origin === 'ocr' && '（图片识别，请核对）'}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                  <span className="flex items-center justify-end gap-2">
                    {code.filledAt ? (
                      <>
                        <Tag tone="green">已填写</Tag>
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={!open || !connected || busy}
                          onClick={() => setConfirming([code])}
                        >
                          重新填写…
                        </Button>
                      </>
                    ) : !open ? (
                      <Tag>{now < published ? '未开始' : '已过期'}</Tag>
                    ) : (
                      <Button
                        size="sm"
                        disabled={value.length < 4 || !connected || busy}
                        onClick={() => setConfirming([code])}
                      >
                        填写
                      </Button>
                    )}
                  </span>
                </li>
              )
            })
          )}
        </ul>
      </Panel>

      {confirming && (
        <AttendanceSubmitDialog
          items={confirming.map((code) => ({
            key: code.id,
            course: code.course,
            week: code.week,
            session: code.session,
            code: codeOf(code),
          }))}
          fillBusy={busy}
          onClose={() => {
            if (!busy) setConfirming(null)
          }}
          onFill={() => void applyFill(confirming)}
          onSubmit={() => submit(confirming)}
        />
      )}
    </div>
  )
}
