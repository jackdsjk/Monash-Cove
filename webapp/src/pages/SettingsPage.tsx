import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Copy, Download, RefreshCw } from 'lucide-react'
import { useStore } from '../store'
import { navigate } from '../lib/router'
import { fetchSyncStatus, startFullSync } from '../data/repository'
import { Button, PageTitle, Panel, Select } from '../components/ui'

const MCP_SNIPPET = `{
  "mcpServers": {
    "cove": {
      "command": "cove",
      "args": ["mcp", "--read-only"]
    }
  }
}`

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 grid-cols-1 gap-4 border-b border-line py-6 last:border-b-0 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
      <div>
        <h2 className="text-[14px] font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>}
      </div>
      <div>{children}</div>
    </section>
  )
}

function Line({ label, detail, action }: { label: string; detail?: string; action: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="text-[13px] font-medium text-slate-800">{label}</p>
        {detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
      </div>
      {action}
    </div>
  )
}

function Confirm({
  open,
  danger,
  title,
  confirmLabel,
  children,
  onCancel,
  onConfirm,
}: {
  open: boolean
  danger?: boolean
  title: string
  confirmLabel: string
  children: ReactNode
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!open) return null
  return (
    <div className="overlay-enter fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-6" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="dialog-enter w-[440px] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
      >
        <div className="px-5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{children}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button onClick={onCancel}>取消</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export function SettingsPage() {
  const { settings, updateSettings, items, changes, marks, sources, clearAllData, clearMarks, restartSetup, refresh } = useStore()
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmMarks, setConfirmMarks] = useState(false)
  const [showData, setShowData] = useState(false)
  const [copied, setCopied] = useState(false)
  const [fullSyncing, setFullSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const mounted = useRef(true)
  const syncing = fullSyncing || sources.some((s) => s.state === 'syncing')
  const markCount = Object.values(marks).filter((m) => Object.keys(m).length).length
  const dump = JSON.stringify({ settings, items: items.length, item_changes: changes.length, marks }, null, 2)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const exportAll = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ settings, items, item_changes: changes, marks }, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'cove-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  // 全量同步是一个后台任务：POST 只负责排队，进度和结束状态都以 /api/sync/status 为准。
  const runFullSync = async () => {
    if (fullSyncing) return
    setFullSyncing(true)
    setSyncError(null)
    setSyncNotice(null)
    try {
      await startFullSync()
      const deadline = Date.now() + 30 * 60_000
      let current = await fetchSyncStatus()
      while (mounted.current && current.job?.status === 'running' && Date.now() < deadline) {
        await wait(2_000)
        if (!mounted.current) return
        current = await fetchSyncStatus()
      }
      if (current.job?.status === 'running') throw new Error('全量同步仍在运行，请稍后到来源页查看状态')
      if (current.job?.status === 'error') throw new Error('全量同步失败，请在来源页查看失败的来源')
      if (!current.job) throw new Error('无法读取全量同步任务状态，请稍后重试')
      if (mounted.current) setSyncNotice(current.job.status === 'skipped'
        ? current.job.message || '没有可执行全量同步的来源，请先连接 Gmail、Ed、Moodle 或 OnTrack。'
        : `已完成 ${Object.values(current.job.sources).filter((source) => source.status === 'done').length} 个来源的全量同步；未配置的来源已跳过。`)
      await refresh()
    } catch (cause) {
      if (mounted.current) setSyncError(cause instanceof Error ? cause.message : '全量同步失败')
    } finally {
      if (mounted.current) setFullSyncing(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1040px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <PageTitle title="设置" />
      <Panel className="px-6">
        <Section title="称呼与地区" description="地区决定截止时间的显示时区。">
          <div className="flex flex-wrap items-center gap-5">
            <label className="flex min-w-0 max-w-full items-center gap-2 text-[13px] text-slate-600">
              <span className="shrink-0 whitespace-nowrap">称呼</span>
              <input
                value={settings.name}
                onChange={(e) => updateSettings({ name: e.target.value })}
                className="h-8 min-w-0 w-44 rounded-md border border-slate-300 px-2.5 text-[13px] text-slate-800 outline-none focus:border-brand-500"
              />
            </label>
            <Select
              label="时区"
              value={settings.timezone}
              onChange={(v) => updateSettings({ timezone: v })}
              options={[
                { value: 'Australia/Melbourne', label: 'Australia/Melbourne (AEST)' },
                { value: 'Asia/Shanghai', label: 'Asia/Shanghai (CST)' },
                { value: 'Asia/Kuala_Lumpur', label: 'Asia/Kuala_Lumpur (MYT)' },
              ]}
            />
          </div>
        </Section>

        <Section title="打开时" description="每次打开 Cove，弹出自上次打开以来的更新摘要。">
          <label className="flex items-center gap-2.5 text-[13px] text-slate-800">
            <input
              type="checkbox"
              checked={settings.showLaunchSummary !== false}
              onChange={(e) => updateSettings({ showLaunchSummary: e.target.checked })}
              className="h-4 w-4 accent-brand-600"
            />
            显示本次打开摘要
          </label>
        </Section>

        <Section title="同步" description="平时只做增量同步。全量同步会重新读取已配置的 Gmail、Ed、Moodle 和 OnTrack，耗时较长。">
          <div className="divide-y divide-line rounded-md border border-line">
            <Line
              label="全量同步"
              detail="重新读取已连接来源的历史内容；OnTrack 包括当前账号可访问项目的任务和全部反馈，无法恢复服务器已隐藏或删除的内容"
              action={
                <Button onClick={() => void runFullSync()} disabled={syncing}>
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? '同步中' : '开始全量同步'}
                </Button>
              }
            />
            {syncError && (
              <p role="alert" className="px-4 py-3 text-xs text-red-700">
                {syncError}
              </p>
            )}
            {syncNotice && <p role="status" className="px-4 py-3 text-xs text-slate-600">{syncNotice}</p>}
            <Line label="设置向导" detail="逐个连接还没连接的来源，已连接的会保留" action={<Button onClick={() => { restartSetup(); navigate('/setup') }}>重新运行</Button>} />
          </div>
        </Section>

        <Section title="本地数据" description="所有内容只保存在这台电脑上，不上传云端，也不写入 Git。">
          <div className="divide-y divide-line rounded-md border border-line">
            <Line label="当前数据" detail={`${items.length} 条条目 · ${changes.length} 处字段变更 · ${markCount} 条你的标记`} action={<Button onClick={() => setShowData((v) => !v)}>{showData ? '收起' : '查看'}</Button>} />
            {showData && <pre className="scroll-y max-h-56 bg-slate-50 px-4 py-3 font-mono text-xs leading-relaxed text-slate-700">{dump}</pre>}
            <Line label="导出" detail="下载全部本地数据（JSON）" action={<Button onClick={exportAll}><Download className="h-3.5 w-3.5" />导出</Button>} />
            <Line label="清除我的标记" detail="已读、已提交、不重要、不是给我的" action={<Button onClick={() => setConfirmMarks(true)} disabled={!markCount}>清除标记</Button>} />
            <Line label="清除全部本地数据" detail="删除所有条目、变更记录和标记；来源连接保留" action={<Button variant="danger" onClick={() => setConfirmClear(true)} disabled={!items.length}>清除数据</Button>} />
          </div>
        </Section>

        <Section title="MCP 只读接入" description="把本地数据以只读方式提供给你自己的 Agent。不会暴露凭据，也不能写入。">
          <div className="relative">
            <pre className="overflow-x-auto rounded-md border border-line bg-slate-50 px-4 py-3 font-mono text-xs leading-relaxed text-slate-700">{MCP_SNIPPET}</pre>
            <Button
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => {
                void navigator.clipboard?.writeText(MCP_SNIPPET)
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1500)
              }}
            >
              <Copy className="h-3 w-3" />
              {copied ? '已复制' : '复制'}
            </Button>
          </div>
        </Section>

        <Section title="产品边界">
          <ul className="list-disc space-y-1.5 pl-4 text-[13px] text-slate-700">
            <li>不判断单条内容是否重要，不显示「必须处理」一类标签</li>
            <li>不自动提交作业，不代你回复老师或发送消息</li>
            <li>考勤默认只填写不提交，提交需要你确认</li>
            <li>不提供日历与提醒，也不生成摘要结论</li>
          </ul>
        </Section>
      </Panel>

      <Confirm
        open={confirmClear}
        danger
        title="清除全部本地数据？"
        confirmLabel="清除"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clearAllData()
          setConfirmClear(false)
        }}
      >
        将删除 {items.length} 条条目、{changes.length} 处字段变更和 {markCount} 条标记。来源连接会保留，之后可以通过全量同步重新获取。
      </Confirm>
      <Confirm
        open={confirmMarks}
        title="清除你的标记？"
        confirmLabel="清除"
        onCancel={() => setConfirmMarks(false)}
        onConfirm={() => {
          clearMarks()
          setConfirmMarks(false)
        }}
      >
        {markCount} 条标记会被删除，标为「不重要」或「不是给我的」的条目会重新出现在首页。
      </Confirm>
    </div>
  )
}
