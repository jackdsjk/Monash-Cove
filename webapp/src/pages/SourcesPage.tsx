import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'
import { useStore } from '../store'
import { SOURCE_LABEL } from '../data/model'
import type { SourceId } from '../data/model'
import {
  cancelMoodleAssistant,
  cancelOnTrackAssistant,
  fetchCredentials,
  fetchMoodleAssistant,
  fetchOnTrackAssistant,
  startMoodleAssistant,
  startOnTrackAssistant,
} from '../data/repository'
import { fmtWhen } from '../lib/time'
import { Button, PageTitle, Panel, Select, SOURCE_MARK } from '../components/ui'
import type { CredentialInfo, MoodleAssistantState } from '../types'
import { invalidateSourceQueries } from '../data/query-cache'

const DESC: Record<SourceId, string> = {
  gmail: '学校邮箱中的课程通知与教务邮件 · 只读权限 gmail.readonly',
  ed: '课程讨论、公告与学习内容 · Ed API token',
  moodle: '作业、成绩、资料与课程板块 · 本地登录助手（Monash SSO）',
  ontrack: '任务状态与评论 · 复用 Moodle 的 Monash SSO 凭据',
}

const CONNECT_HINT: Record<SourceId, string> = {
  gmail: 'Gmail 使用 Google OAuth，授权后凭据只保存在本机 Keychain。',
  ed: 'Ed 使用 API token，token 只保存在本机 Keychain。',
  moodle: '登录助手会打开一个 Chrome 窗口，完成 Monash 登录后凭据自动保存到本机，不需要手动复制。',
  ontrack: '登录助手会打开一个 Chrome 窗口，完成 Monash SSO 登录后 OnTrack 凭据自动保存到本机。',
}

/**
 * local-service 在会话过期时写入的固定文案（见 local-service/src/moodle-session.ts）。
 * 匹配到它说明 Cookie 还在本机、只是失效了：按钮应该回到登录助手，而不是再同步一次。
 */
const SESSION_EXPIRED = /会话已过期|session expired/i

/** 凭据有效期来自本地服务的 /api/credentials，不把“已连接”当成永不过期。 */
function credentialLine(entry: CredentialInfo | undefined, now: number): string {
  if (!entry?.connected) return '凭据未保存在本机'
  if (!entry.expiresAt) return entry.renewable ? '长期有效，自动续期' : '无固定到期，失效时需重连'
  const at = Date.parse(entry.expiresAt)
  if (!Number.isFinite(at)) return entry.note
  if (at <= now) return `凭据已于 ${fmtWhen(at, now)} 过期`
  return `凭据有效至 ${fmtWhen(at, now)}${entry.renewable ? '，自动续期' : ''}`
}

function Dialog({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="overlay-enter fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="dialog-enter w-[520px] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
      >
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>}
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export function SourcesPage({ setup = false }: { setup?: boolean }) {
  const { sources, now, syncSource, syncAll, refresh, completeSetup } = useStore()
  const busy = sources.some((s) => s.state === 'syncing')
  const [credentials, setCredentials] = useState<CredentialInfo[]>([])
  const [dialog, setDialog] = useState<SourceId | null>(null)
  const [assistant, setAssistant] = useState<MoodleAssistantState | null>(null)
  const [edToken, setEdToken] = useState('')
  const [edRegion, setEdRegion] = useState<'us' | 'au' | 'eu'>('au')
  const [working, setWorking] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null)

  const loadCredentials = useCallback(async () => {
    setCredentials(await fetchCredentials().catch(() => []))
  }, [])

  useEffect(() => {
    void loadCredentials()
  }, [loadCredentials])

  const openDialog = (id: SourceId) => {
    setDialogError(null)
    setAssistant(null)
    setEdToken('')
    setEdRegion('au')
    setDialog(id)
  }

  const startAssistant = async (id: 'moodle' | 'ontrack') => {
    setWorking(true)
    setDialogError(null)
    try {
      setAssistant(id === 'moodle' ? await startMoodleAssistant() : await startOnTrackAssistant())
    } catch (cause) {
      setDialogError(cause instanceof Error ? cause.message : '登录助手启动失败')
    } finally {
      setWorking(false)
    }
  }

  const cancelAssistant = async () => {
    setWorking(true)
    try {
      if (dialog === 'moodle') setAssistant(await cancelMoodleAssistant())
      if (dialog === 'ontrack') setAssistant(await cancelOnTrackAssistant())
      setDialog(null)
    } catch (cause) {
      setDialogError(cause instanceof Error ? cause.message : '取消登录失败')
    } finally {
      setWorking(false)
    }
  }

  const closeDialog = () => {
    if (dialog === 'moodle' || dialog === 'ontrack') {
      if (assistant?.status === 'waiting_login') {
        void cancelAssistant()
        return
      }
    }
    setDialog(null)
    setDialogError(null)
  }

  const connectGmail = async () => {
    setWorking(true)
    try {
      const response = await fetch('/api/oauth/google/start')
      const body = (await response.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null
      if (!response.ok || !body?.url) throw new Error(body?.error?.message ?? 'Google OAuth 尚未配置')
      window.location.assign(body.url)
    } catch (cause) {
      setNotice({ title: '无法连接 Gmail', message: cause instanceof Error ? cause.message : 'Google OAuth 启动失败' })
    } finally {
      setWorking(false)
    }
  }

  const connect = (id: SourceId) => {
    if (id === 'gmail') {
      void connectGmail()
      return
    }
    openDialog(id)
    if (id === 'moodle' || id === 'ontrack') void startAssistant(id)
  }

  const saveEd = async () => {
    const token = edToken.trim()
    if (!token) return
    setWorking(true)
    setDialogError(null)
    invalidateSourceQueries('ed')
    try {
      const response = await fetch('/api/sources/ed/credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, region: edRegion }),
      })
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
      if (!response.ok) throw new Error(body?.error?.message ?? `保存 Ed 凭据失败（HTTP ${response.status}）`)
      invalidateSourceQueries('ed')
      setDialog(null)
      syncSource('ed')
      void loadCredentials()
    } catch (cause) {
      setDialogError(cause instanceof Error ? cause.message : '保存 Ed 凭据失败')
    } finally {
      setWorking(false)
    }
  }

  const disconnect = async (id: SourceId) => {
    setWorking(true)
    invalidateSourceQueries(id)
    try {
      const path = id === 'gmail' ? '/api/oauth/google/disconnect' : `/api/sources/${id}/disconnect`
      const response = await fetch(path, { method: 'POST' })
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
      if (!response.ok) throw new Error(body?.error?.message ?? `断开失败（HTTP ${response.status}）`)
      invalidateSourceQueries(id)
      await refresh()
      await loadCredentials()
    } catch (cause) {
      setNotice({ title: `无法断开 ${SOURCE_LABEL[id]}`, message: cause instanceof Error ? cause.message : '断开失败' })
    } finally {
      setWorking(false)
    }
  }

  // 登录助手在本地开一个 Chrome 窗口，连上后服务端状态变成 connected。
  useEffect(() => {
    if ((dialog !== 'moodle' && dialog !== 'ontrack') || assistant?.status !== 'waiting_login') return
    const load = dialog === 'moodle' ? fetchMoodleAssistant : fetchOnTrackAssistant
    const timer = window.setInterval(() => {
      void load()
        .then((next) => {
          setAssistant(next)
          if (next.status === 'connected') {
            setDialog(null)
            void refresh()
            void loadCredentials()
          }
        })
        .catch(() => undefined)
    }, 1_500)
    return () => window.clearInterval(timer)
  }, [assistant?.status, dialog, loadCredentials, refresh])

  const assistantSource = dialog === 'moodle' || dialog === 'ontrack' ? dialog : null

  return (
    <div className="mx-auto max-w-[1240px] px-10 py-8">
      <PageTitle
        title={setup ? '首次设置' : '来源'}
        description={setup ? '选择需要的来源连接，也可以稍后再连接。凭据保存在本机。' : '每个来源授权一次，此后在后台增量同步。凭据保存在本机。'}
        actions={
          <Button onClick={() => syncAll()} disabled={busy}>
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            全部增量同步
          </Button>
        }
      />
      <Panel className="divide-y divide-line">
        {sources.map((s) => {
          const entry = credentials.find((c) => c.source === s.id)
          const needsRelogin = s.id === 'moodle' && s.connected && SESSION_EXPIRED.test(s.error ?? '')
          return (
            <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_220px_90px_200px] items-center gap-6 px-5 py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-slate-900">
                  <span aria-hidden className={`h-2.5 w-2.5 rounded-[2px] ${SOURCE_MARK[s.id]}`} />
                  {SOURCE_LABEL[s.id]}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{DESC[s.id]}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {s.connected ? (entry ? credentialLine(entry, now) : s.account) : '未连接'}
                </p>
              </div>

              <div className="text-[13px]">
                {!s.connected ? (
                  <span className="text-slate-500">未连接</span>
                ) : s.state === 'syncing' ? (
                  <span className="flex items-center gap-1.5 text-brand-700">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> 正在同步
                  </span>
                ) : s.state === 'error' ? (
                  <div>
                    <span className="flex items-center gap-1.5 font-medium text-red-700">
                      <AlertCircle className="h-3.5 w-3.5" /> 同步失败
                    </span>
                    <p className="mt-0.5 text-xs text-slate-600">{s.error}</p>
                    {s.lastSuccessAt && <p className="text-xs text-slate-500">上次成功：{fmtWhen(s.lastSuccessAt, now)}</p>}
                  </div>
                ) : (
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    {s.lastSyncAt ? `同步于 ${fmtWhen(s.lastSyncAt, now)}` : '已连接'}
                  </span>
                )}
              </div>

              <div className="text-right text-[13px] text-slate-700">
                {s.itemCount} <span className="text-xs text-slate-500">条</span>
              </div>

              <div className="flex justify-end gap-2">
                {s.connected ? (
                  <>
                    <Button
                      size="sm"
                      variant={s.state === 'error' ? 'primary' : 'secondary'}
                      disabled={s.state === 'syncing'}
                      onClick={() => (needsRelogin ? connect('moodle') : syncSource(s.id))}
                    >
                      {needsRelogin ? '重新登录' : '重新同步'}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={working} onClick={() => void disconnect(s.id)}>
                      断开
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="primary" disabled={s.state === 'syncing' || working} onClick={() => connect(s.id)}>
                    {s.state === 'syncing' ? '连接中…' : '连接'}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </Panel>

      {setup && (
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button variant="primary" onClick={completeSetup} disabled={working || busy}>
            {sources.some((s) => s.connected) ? '完成设置' : '暂时跳过，进入简报'}
          </Button>
        </div>
      )}

      {dialog && (
        <Dialog
          title={`连接 ${SOURCE_LABEL[dialog]}`}
          description={CONNECT_HINT[dialog]}
          onClose={() => {
            if (!working) closeDialog()
          }}
        >
          {dialog === 'ed' ? (
            <div>
              <label className="block text-[13px] text-slate-600">
                Ed API token
                <input
                  type="password"
                  value={edToken}
                  onChange={(e) => setEdToken(e.target.value)}
                  placeholder="只保存在本机 Keychain"
                  className="mt-1.5 h-9 w-full rounded-lg border border-line px-2.5 text-[13px] text-slate-800 outline-none focus:border-brand-500"
                />
              </label>
              <div className="mt-4 flex items-center justify-between gap-4">
                <Select
                  label="区域"
                  value={edRegion}
                  onChange={setEdRegion}
                  options={[
                    { value: 'au', label: 'AU' },
                    { value: 'us', label: 'US' },
                    { value: 'eu', label: 'EU' },
                  ]}
                />
                <div className="flex gap-2">
                  <Button onClick={closeDialog} disabled={working}>
                    取消
                  </Button>
                  <Button variant="primary" onClick={() => void saveEd()} disabled={working || !edToken.trim()}>
                    {working ? '保存中…' : '保存到本机'}
                  </Button>
                </div>
              </div>
            </div>
          ) : assistantSource ? (
            <div>
              {working && !assistant && <p className="text-xs text-slate-500">正在启动登录助手…</p>}
              {assistant?.status === 'waiting_login' && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-brand-700">
                  <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                  <span>{assistant.message || '请在打开的 Chrome 窗口完成登录'}</span>
                </p>
              )}
              {assistant?.status === 'error' && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{assistant.message}</span>
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                {assistant?.status === 'waiting_login' ? (
                  <Button onClick={() => void cancelAssistant()} disabled={working}>
                    取消登录
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => void startAssistant(assistantSource)} disabled={working}>
                    {working ? '启动中…' : '打开登录助手'}
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {dialogError && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{dialogError}</span>
            </p>
          )}
        </Dialog>
      )}

      {notice && (
        <Dialog title={notice.title} onClose={() => setNotice(null)}>
          <p className="text-[13px] leading-relaxed text-slate-600">{notice.message}</p>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setNotice(null)}>知道了</Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
