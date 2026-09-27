// Pulls the public state of every template: live metadata, page SEO fields,
// manifest validation, icon reachability, community thread activity and the
// marketplace search position for each tracked keyword. Writes data/latest.json
// and data/history/<date>.json. Everything here is read-only and unauthenticated.
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { dataDir, decodeEntities, gql, latestSnapshotPath, loadTemplates, probe, today } from './lib'

type Live = {
  code: string
  name: string
  description: string | null
  category: string | null
  image: string | null
  health: number | null
  activeProjects: number
  recentProjects: number
  projects: number
  isVerified: boolean
  updatedAt: string
  communityThreadSlug: string | null
  readme: string | null
}

type SearchNode = { code: string; name: string; deploymentCount: number; healthScore: number | null }

export type Rank = { keyword: string; position: number | null; total: number | null; top: string[] }

export type Snapshot = {
  date: string
  templates: Record<
    string,
    {
      live: Omit<Live, 'readme'> & { readmeWords: number }
      page: { status: number; title: string; description: string; canonical: string; h1: string }
      manifest: { status: string; successRate30d: number | null; failedChecks: string[] }
      icon: { url: string | null; status: number; type: string }
      thread: { slug: string | null; replies: number | null; lastReplyAt: string }
      ranks: Rank[]
    }
  >
}

const templateQuery = `query t($code: String!) { template(code: $code) {
  code name description category image health activeProjects recentProjects projects
  isVerified updatedAt communityThreadSlug readme } }`

const searchQuery = `query s($q: String!) { templateSearch(query: $q, first: 60) {
  edges { node { code name deploymentCount healthScore } } } }`

const searchCache = new Map<string, SearchNode[] | null>()

const search = async (keyword: string) => {
  const cached = searchCache.get(keyword)
  if (cached !== undefined) return cached
  const data = await gql<{ templateSearch: { edges: { node: SearchNode }[] } }>(searchQuery, { q: keyword })
  const nodes = data ? data.templateSearch.edges.map((e) => e.node) : null
  searchCache.set(keyword, nodes)
  return nodes
}

const rank = async (keyword: string, code: string): Promise<Rank> => {
  const nodes = await search(keyword)
  if (!nodes) return { keyword, position: null, total: null, top: [] }
  const index = nodes.findIndex((n) => n.code === code)
  return {
    keyword,
    position: index === -1 ? null : index + 1,
    total: nodes.length,
    top: nodes.slice(0, 3).map((n) => `${n.name} (${n.code}, ${n.deploymentCount} active, health ${n.healthScore ?? 'n/a'})`),
  }
}

const page = async (code: string) => {
  const res = await fetch(`https://railway.com/deploy/${code}`, { headers: { 'user-agent': 'Mozilla/5.0' } }).catch(() => null)
  const empty = { status: res?.status ?? 0, title: '', description: '', canonical: '', h1: '' }
  if (!res?.ok) return empty
  const html = await res.text().catch(() => null)
  if (html === null) return empty
  const pick = (re: RegExp) => decodeEntities(html.match(re)?.[1] ?? '')
  return {
    status: res.status,
    title: pick(/<title>([^<]*)<\/title>/),
    description: pick(/<meta name="description" content="([^"]*)"/),
    canonical: pick(/<link rel="canonical" href="([^"]*)"/),
    h1: pick(/<h1[^>]*>([^<]*)<\/h1>/),
  }
}

const manifest = async (code: string) => {
  const res = await fetch(`https://railway.com/deploy/${code}/manifest.json`).catch(() => null)
  const m = (await res.json().catch(() => null)) as null | {
    status?: string
    success_rate_30d?: number | null
    validation?: { checks?: { name: string; passed: boolean; detail?: string }[] }
  }
  if (!res?.ok || !m) return { status: 'unavailable', successRate30d: null, failedChecks: [] as string[] }
  const failed = (m.validation?.checks ?? []).filter((c) => !c.passed).map((c) => (c.detail ? `${c.name}: ${c.detail}` : c.name))
  return { status: m.status ?? 'unknown', successRate30d: m.success_rate_30d ?? null, failedChecks: failed }
}

const thread = async (slug: string | null) => {
  if (!slug) return { slug, replies: 0, lastReplyAt: '' }
  const res = await fetch(`https://station-server.railway.com/api/threads/${slug}?format=md`).catch(() => null)
  const md = res?.ok ? await res.text().catch(() => null) : null
  if (md === null) return { slug, replies: null, lastReplyAt: '' }
  const replies = (md.match(/^### Reply \d+/gm) ?? []).length
  const dates = md.match(/^\*\d{4}-\d{2}-\d{2}T[^*]*\*$/gm) ?? []
  return { slug, replies, lastReplyAt: dates.at(-1)?.slice(1, 11) ?? '' }
}

const main = async () => {
  const templates = await loadTemplates()
  const snapshot: Snapshot = { date: today(), templates: {} }
  for (const { meta } of templates) {
    const data = await gql<{ template: Live | null }>(templateQuery, { code: meta.code })
    const live = data?.template
    if (!live) {
      console.error(`no live data for ${meta.code}, snapshot not written`)
      process.exit(1)
    }
    const { readme, ...rest } = live
    const icon = live.image ? await probe(live.image) : { ok: false, status: 0, type: '' }
    const ranks: Rank[] = []
    for (const keyword of meta.keywords) ranks.push(await rank(keyword, meta.code))
    snapshot.templates[meta.code] = {
      live: { ...rest, readmeWords: (readme ?? '').split(/\s+/).filter(Boolean).length },
      page: await page(meta.code),
      manifest: await manifest(meta.code),
      icon: { url: live.image, status: icon.status, type: icon.type },
      thread: await thread(live.communityThreadSlug),
      ranks,
    }
    console.log(`${meta.code}: health ${live.health ?? 'n/a'}, active ${live.activeProjects}, ranks ${ranks.map((r) => `${r.keyword}=${r.position ?? '-'}`).join(' ')}`)
  }
  await mkdir(join(dataDir, 'history'), { recursive: true })
  const json = JSON.stringify(snapshot, null, 2)
  await Bun.write(latestSnapshotPath, json)
  await Bun.write(join(dataDir, 'history', `${snapshot.date}.json`), json)
}

await main()
