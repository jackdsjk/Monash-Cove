/** Thin browser adapter for the existing, validated Always-Ontrack artifact routes. */
export type OnTrackMaterialKind = 'task' | 'resources' | 'submission'

export function onTrackMaterialUrl(projectId: number, taskDefinitionId: number, kind: OnTrackMaterialKind): string {
  if (!Number.isSafeInteger(projectId) || projectId <= 0 || !Number.isSafeInteger(taskDefinitionId) || taskDefinitionId <= 0) {
    throw new Error('OnTrack 任务缺少有效的项目或定义编号。')
  }
  return `/api/ontrack/artifact?${new URLSearchParams({ project: String(projectId), task: String(taskDefinitionId), kind })}`
}

export async function fetchOnTrackMaterial(projectId: number, taskDefinitionId: number, kind: OnTrackMaterialKind, signal: AbortSignal): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(onTrackMaterialUrl(projectId, taskDefinitionId, kind), {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? `OnTrack 文件读取失败：HTTP ${response.status}`)
  }
  const type = response.headers.get('content-type') ?? ''
  if (/text\/html|application\/(?:\w+\+)?json/i.test(type)) throw new Error('OnTrack 返回了页面而非文件，请检查连接后重试。')
  const blob = await response.blob()
  if (blob.size === 0) throw new Error('OnTrack 返回了空文件，请稍后重试。')
  const suppliedName = /filename="([^"]+)"/i.exec(response.headers.get('content-disposition') ?? '')?.[1]
  const filename = (suppliedName ?? `ontrack-${kind}-${taskDefinitionId}${kind === 'resources' ? '.zip' : '.pdf'}`)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
  return { blob, filename }
}
