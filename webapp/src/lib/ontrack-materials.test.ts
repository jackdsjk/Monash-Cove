import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOnTrackMaterial, onTrackMaterialUrl } from './ontrack-materials'

beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Real network blocked') })))
afterEach(() => vi.unstubAllGlobals())

describe('existing OnTrack material API', () => {
  it('uses project and definition IDs for worksheets before any personal instance exists', () => {
    expect(onTrackMaterialUrl(1, 42, 'task')).toBe('/api/ontrack/artifact?project=1&task=42&kind=task')
    expect(onTrackMaterialUrl(1, 42, 'resources')).toContain('kind=resources')
    expect(onTrackMaterialUrl(1, 42, 'submission')).toContain('kind=submission')
    expect(() => onTrackMaterialUrl(1, 0, 'task')).toThrow('有效的项目或定义编号')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves the filename supplied by the local artifact validator', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('fixture-file', { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="ontrack-task-42.pdf"' } }))
    const result = await fetchOnTrackMaterial(1, 42, 'task', new AbortController().signal)
    expect(result.filename).toBe('ontrack-task-42.pdf')
    expect(await result.blob.text()).toBe('fixture-file')
    expect(fetch).toHaveBeenCalledWith('/api/ontrack/artifact?project=1&task=42&kind=task', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('keeps a resource original extension supplied by the validated API', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('fixture', { headers: { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="ontrack-resources-42.txt"' } }))
    expect((await fetchOnTrackMaterial(1, 42, 'resources', new AbortController().signal)).filename).toBe('ontrack-resources-42.txt')
  })

  it('shows the server reason for missing or still-processing files', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: { message: '文件仍在处理中' } }, { status: 502 }))
    await expect(fetchOnTrackMaterial(1, 42, 'task', new AbortController().signal)).rejects.toThrow('文件仍在处理中')
  })

  it.each(['text/html', 'application/json'])('rejects a successful %s page instead of downloading it', async (type) => {
    vi.mocked(fetch).mockResolvedValue(new Response('not a file', { headers: { 'content-type': type } }))
    await expect(fetchOnTrackMaterial(1, 42, 'task', new AbortController().signal)).rejects.toThrow('页面而非文件')
  })

  it('rejects empty downloads', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { headers: { 'content-type': 'application/pdf' } }))
    await expect(fetchOnTrackMaterial(1, 42, 'task', new AbortController().signal)).rejects.toThrow('空文件')
  })
})
