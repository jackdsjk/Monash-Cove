import type { ReactNode } from 'react'
import { PlugZap } from 'lucide-react'
import { useStore } from '../store'
import { navigate } from '../lib/router'
import { SOURCE_LABEL, type SourceId } from '../data/model'
import { Button, IconTile, PageTitle, Panel } from './ui'

/** 页面依赖的来源未连接时，显示连接入口，而不是展示数据 */
export function RequireSource({
  ids,
  title,
  description,
  children,
}: {
  /** 任一来源已连接即可 */
  ids: SourceId[]
  title: string
  description: string
  children: ReactNode
}) {
  const { sources, connectSource, restartSetup } = useStore()
  const needed = sources.filter((s) => ids.includes(s.id))
  if (needed.some((s) => s.connected)) return <>{children}</>

  const names = ids.map((id) => SOURCE_LABEL[id]).join(' 或 ')
  return (
    <div className="mx-auto max-w-[1240px] px-10 py-8">
      <PageTitle title={title} />
      <Panel className="flex flex-col items-center px-8 py-14 text-center">
        <IconTile icon={PlugZap} />
        <h2 className="mt-4 text-[17px] font-bold text-slate-900">需要先连接 {names}</h2>
        <p className="mt-1.5 max-w-[46ch] text-sm text-slate-600">{description}</p>
        <div className="mt-6 flex items-center gap-2">
          {needed.map((s) => (
            <Button key={s.id} variant="primary" disabled={s.state === 'syncing'} onClick={() => connectSource(s.id)}>
              {s.state === 'syncing' ? '连接中…' : `连接 ${SOURCE_LABEL[s.id]}`}
            </Button>
          ))}
          <Button
            onClick={() => {
              restartSetup()
              navigate('/setup')
            }}
          >
            打开设置向导
          </Button>
        </div>
      </Panel>
    </div>
  )
}
