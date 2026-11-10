import { useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Send, ShieldAlert } from 'lucide-react'
import type { AttendanceSubmitResult, AttendanceSubmitStatus, AttendanceSubmitSummary } from '../types'
import { AttendanceSubmitError } from '../data/repository'
import { Button, Tag } from './ui'

/**
 * 考勤操作弹窗。默认动作是「只填不提交」；「提交」是次要按钮，并且要点两下
 * （核对 → 最后确认）才会真的写入门户。提交结果逐条原样展示，不重试、不美化。
 */
export interface AttendanceDialogItem {
  key: string
  course: string
  week: number
  session: string
  code: string
}

const PORTAL_URL = 'https://attendance.monash.edu.my/student/Default.aspx'

const STATUS: Record<AttendanceSubmitStatus, { label: string; tone: 'green' | 'red' | 'amber' | 'slate' }> = {
  submitted: { label: '已提交', tone: 'green' },
  invalid_code: { label: '代码无效', tone: 'red' },
  not_open: { label: '未开放', tone: 'amber' },
  not_found: { label: '未找到班次', tone: 'amber' },
  timeout: { label: '超时 · 结果未知', tone: 'red' },
  error: { label: '出错 · 结果未知', tone: 'red' },
  unknown: { label: '未知 · 结果未知', tone: 'amber' },
  not_attempted: { label: '未提交', tone: 'slate' },
}

type Phase = 'review' | 'confirm' | 'submitting' | 'results' | 'failed'

function ItemList({ items }: { items: AttendanceDialogItem[] }) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-line">
      <div className="grid grid-cols-[minmax(0,1fr)_64px_120px_104px] gap-2 border-b border-line bg-slate-50/70 px-3 py-1.5 text-[11px] font-medium text-slate-500">
        <span>课程</span>
        <span>周次</span>
        <span>班次</span>
        <span className="text-right">代码</span>
      </div>
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.key} className="grid grid-cols-[minmax(0,1fr)_64px_120px_104px] items-center gap-2 px-3 py-2 text-[13px]">
            <span className="truncate font-semibold text-slate-800" title={item.course}>
              {item.course}
            </span>
            <span className="whitespace-nowrap text-slate-600">Week {item.week}</span>
            <span className="truncate text-slate-700">{item.session}</span>
            <code className="text-right font-mono tracking-wider text-slate-900">{item.code}</code>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ResultList({ results }: { results: AttendanceSubmitResult[] }) {
  return (
    <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
      {results.map((result, index) => {
        const status = STATUS[result.status]
        return (
          <li key={`${result.course ?? ''}-${result.session ?? ''}-${index}`} className="px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 text-[13px] text-slate-800">
                <strong className="font-semibold">{result.course ?? '（缺少课程）'}</strong>
                {typeof result.week === 'number' && <> · Week {result.week}</>}
                {result.session ? <> · {result.session}</> : null} ·{' '}
                <code className="font-mono tracking-wider text-slate-900">{result.code}</code>
              </span>
              <Tag tone={status.tone}>{status.label}</Tag>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-600">{result.message}</p>
            {result.feedback && (
              <div className="mt-1.5">
                <p className="text-[11px] font-medium text-slate-500">门户原话</p>
                <pre className="mt-0.5 max-h-24 overflow-y-auto rounded-md bg-slate-50 px-2 py-1.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-slate-700">
                  {result.feedback}
                </pre>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function BeforeRetry() {
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-700">
      <p className="font-semibold text-slate-800">现在要做的</p>
      <p className="mt-1">
        先按上面的提示处理（重新连接 Attendance，或等正在进行的提交结束），再回来重新核对并提交。Cove
        不会自动重试，也不会在后台补交。
      </p>
    </div>
  )
}

function WhatsNext() {
  return (
    <div className="mt-3 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2.5 text-[12px] leading-relaxed text-red-900">
      <p className="font-semibold">现在要做的（Cove 不会替你重试）</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-4">
        <li>打开 Monash 考勤门户，查看这一周每个班次的实际状态，以门户为准。</li>
        <li>如果门户显示「未记录」且代码窗口还开着，再在门户里手动提交一次。</li>
        <li>如果门户显示已记为缺席、或状态与这里不一致，立刻联系任课老师 / unit coordinator，说明班次、周次和代码。</li>
      </ol>
      <a
        href={PORTAL_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 inline-block font-medium text-red-800 underline underline-offset-2"
      >
        打开考勤门户
      </a>
    </div>
  )
}

export function AttendanceSubmitDialog({
  items,
  fillBusy,
  onClose,
  onFill,
  onSubmit,
}: {
  items: AttendanceDialogItem[]
  fillBusy: boolean
  onClose: () => void
  onFill: () => void
  onSubmit: () => Promise<AttendanceSubmitSummary>
}) {
  const [phase, setPhase] = useState<Phase>('review')
  const [checked, setChecked] = useState(false)
  const [summary, setSummary] = useState<AttendanceSubmitSummary | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [failureAttempted, setFailureAttempted] = useState(true)
  const submitting = phase === 'submitting'
  const failed = summary ? summary.failed : 0

  const submit = async () => {
    setPhase('submitting')
    setFailure(null)
    try {
      setSummary(await onSubmit())
      setPhase('results')
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : '提交请求失败，结果未知')
      setFailureAttempted(!(cause instanceof AttendanceSubmitError) || cause.attempted)
      setPhase('failed')
    }
  }

  const title =
    phase === 'results'
      ? summary && summary.failed > 0
        ? `提交结果：${summary.submitted} 项成功，${summary.failed} 项失败`
        : '提交结果：全部成功'
      : phase === 'failed'
        ? failureAttempted
          ? '提交结果未知'
          : '没有提交'
        : phase === 'confirm'
          ? '最后确认：真的要提交吗？'
          : `核对这 ${items.length} 项考勤`

  return (
    <div
      className="overlay-enter fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"
      onClick={() => {
        if (!submitting && !fillBusy) onClose()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="dialog-enter max-h-[calc(100vh-32px)] w-[560px] overflow-y-auto rounded-2xl border border-line bg-white shadow-2xl"
      >
        <div className="px-5 pt-5">
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>

          {phase === 'review' && (
            <>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
                将以你的身份向 Monash 考勤门户操作以下班次。请先逐条核对课程、周次、班次和代码：
              </p>
              <ItemList items={items} />
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-[12px] leading-relaxed text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <strong className="font-semibold">「提交」会真的提交到 Monash 考勤系统，提交后不可撤销。</strong>
                  如果代码错误、班次或周次不对，可能被记为旷课，这个后果由你承担。
                </p>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
                默认按钮「只填不提交」只把代码放进表单，不点击提交，你可以自己在门户里核对后再提交。Cove
                不会记住这个选择，也不会以后自动提交。
              </p>
            </>
          )}

          {phase === 'confirm' && (
            <>
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2.5 text-[12px] leading-relaxed text-red-900">
                <p className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    下面这些班次会被<strong className="font-semibold">真的提交</strong>，提交后无法撤回，也没有第三方可以撤销。
                    代码错误、班次不对或周次填错，都可能被记为旷课。
                  </span>
                </p>
              </div>
              <ItemList items={items} />
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-line px-3 py-2.5 text-[12px] leading-relaxed text-slate-700">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
                />
                我已逐条核对课程、周次、班次与代码，知道提交后不可撤销，代码错误可能被记为旷课。
              </label>
            </>
          )}

          {submitting && (
            <div role="status" className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-slate-50 px-3 py-3 text-[13px] text-slate-700">
              <Send className="h-4 w-4 animate-pulse" />
              正在逐条提交，最多 90 秒。请不要关闭窗口——Cove 不会重试。
            </div>
          )}

          {phase === 'results' && summary && (
            <>
              {summary.failed > 0 ? (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2.5 text-[12px] leading-relaxed text-red-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    有 <strong className="font-semibold">{failed} 项</strong>没有成功提交，失败原因见下面每一条（门户原话未做修改）。
                  </p>
                </div>
              ) : (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-[12px] leading-relaxed text-emerald-900">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>全部 {summary.submitted} 项都已被门户明确确认提交成功。建议稍后再到门户确认一次状态。</p>
                </div>
              )}
              <ResultList results={summary.results} />
              {summary.failed > 0 && <WhatsNext />}
            </>
          )}

          {phase === 'failed' && (
            <>
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2.5 text-[12px] leading-relaxed text-red-900">
                <p className="font-medium">{failure}</p>
                {failureAttempted ? (
                  <p className="mt-1">
                    请求没有返回可核对的结果，<strong className="font-semibold">不代表没有提交</strong>，也不代表提交成功。
                  </p>
                ) : (
                  <p className="mt-1">这次没有向考勤门户发送任何代码，可以放心；按下面的步骤处理好再重新提交。</p>
                )}
              </div>
              {failureAttempted ? <WhatsNext /> : <BeforeRetry />}
            </>
          )}
        </div>

        <div className="sticky bottom-0 z-10 mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-slate-50/70 px-5 py-3">
          {phase === 'review' && (
            <>
              <Button onClick={onClose} disabled={fillBusy}>
                取消
              </Button>
              <Button onClick={() => setPhase('confirm')} disabled={fillBusy}>
                <Send className="h-4 w-4 text-red-600" />
                提交（不可撤销）
              </Button>
              <Button variant="primary" onClick={onFill} disabled={fillBusy} autoFocus>
                {fillBusy ? '正在填写…' : '只填不提交'}
              </Button>
            </>
          )}
          {phase === 'confirm' && (
            <>
              <Button
                onClick={() => {
                  setChecked(false)
                  setPhase('review')
                }}
                autoFocus
              >
                返回核对
              </Button>
              <Button variant="danger" onClick={() => void submit()} disabled={!checked}>
                确认提交（不可撤销）
              </Button>
            </>
          )}
          {submitting && <span className="text-[12px] text-slate-500">正在提交，请等待结果…</span>}
          {(phase === 'results' || phase === 'failed') && (
            <Button variant="primary" onClick={onClose} autoFocus>
              关闭
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
