import { appendFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
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

type GqlBody<T> = { data?: T; errors?: { message: string }[] }

const runGql = async <T>(query: string, variables: Record<string, unknown>, headers: Record<string, string>): Promise<T | null> => {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  }).catch(() => null)
  if (!res?.ok) return null
  const body = (await res.json().catch(() => null)) as GqlBody<T> | null
  if (!body) return null
  if (body.errors?.length) {
    console.error(body.errors.map((e) => e.message).join('; '))
    return null
  }
  return body.data ?? null
}

// Unauthenticated: template(code), templateSearch and friends are public.
export const gql = <T>(query: string, variables: Record<string, unknown> = {}) => runGql<T>(query, variables, {})

// The Railway CLI's stored login. `railway whoami` refreshes it when expired.
export const railwayToken = async () => {
  const config = (await Bun.file(join(homedir(), '.railway', 'config.json')).json().catch(() => null)) as { user?: { accessToken?: string } } | null
  return config?.user?.accessToken ?? ''
}

// Authenticated: templateMetrics and anything scoped to the workspace.
export const gqlAuth = async <T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> => {
  const token = await railwayToken()
  if (!token) {
    console.error('no Railway token in ~/.railway/config.json, run `railway login`')
    return null
  }
  return runGql<T>(query, variables, { authorization: `Bearer ${token}` })
}

export const today = () => new Date().toISOString().slice(0, 10)

export const shiftDay = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

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

const jsonFilesIn = async (dir: string) => {
  const files = await readdir(dir).catch(() => [] as string[])
  return files.filter((f) => f.endsWith('.json')).sort().map((f) => join(dir, f))
}

export const historyFiles = () => jsonFilesIn(join(dataDir, 'history'))

export const revenueDir = join(dataDir, 'revenue')
export const revenueLatestPath = join(revenueDir, 'latest.json')
export const revenueDailyPath = join(revenueDir, 'daily.json')
export const revenueHistoryFiles = () => jsonFilesIn(join(revenueDir, 'history'))

// One line per change we made to a template (publish, rename, config, repo),
// so the report can compare earnings before and after.
export type Change = { date: string; at: string; code: string; kind: 'publish' | 'rename' | 'config' | 'repo'; detail: string }

export const changesPath = join(dataDir, 'changes.jsonl')

export const appendChange = async (event: Omit<Change, 'date' | 'at'>) => {
  const line = JSON.stringify({ date: today(), at: new Date().toISOString(), ...event })
  await appendFile(changesPath, `${line}\n`)
}

export const readChanges = async (): Promise<Change[]> => {
  const text = await Bun.file(changesPath).text().catch(() => '')
  const out: Change[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const parsed = (await new Response(line).json().catch(() => null)) as Change | null
    if (parsed) out.push(parsed)
  }
  return out
}
