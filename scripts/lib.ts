import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

export const root = join(import.meta.dir, '..')
export const dataDir = join(root, 'data')
export const reportsDir = join(root, 'reports')

export type Meta = {
  code: string
  name: string
  description: string
  category: string
  image: string | null
  keywords: string[]
}

export type Template = { dir: string; meta: Meta; overview: string }

export const loadTemplates = async (): Promise<Template[]> => {
  const entries = await readdir(join(root, 'templates'), { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
  const out: Template[] = []
  for (const dir of dirs) {
    const base = join(root, 'templates', dir)
    const meta = (await Bun.file(join(base, 'meta.json')).json()) as Meta
    const overview = await Bun.file(join(base, 'overview.md')).text()
    out.push({ dir: base, meta, overview })
  }
  return out
}

const endpoint = 'https://backboard.railway.com/graphql/v2'

export const gql = async <T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> => {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  }).catch(() => null)
  if (!res?.ok) return null
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (body.errors?.length) {
    console.error(body.errors.map((e) => e.message).join('; '))
    return null
  }
  return body.data ?? null
}

export const today = () => new Date().toISOString().slice(0, 10)

const ua = { 'user-agent': 'Mozilla/5.0 (railway-templates check)' }

export type Probe = { ok: boolean; status: number; type: string }

export const probe = async (url: string): Promise<Probe> => {
  const headRes = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: ua }).catch(() => null)
  const res = headRes?.ok ? headRes : await fetch(url, { redirect: 'follow', headers: ua }).catch(() => null)
  if (!res) return { ok: false, status: 0, type: '' }
  return { ok: res.ok, status: res.status, type: res.headers.get('content-type') ?? '' }
}

export const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

export const latestSnapshotPath = join(dataDir, 'latest.json')

export const historyFiles = async () => {
  const dir = join(dataDir, 'history')
  const files = await readdir(dir).catch(() => [] as string[])
  return files.filter((f) => f.endsWith('.json')).sort().map((f) => join(dir, f))
}
