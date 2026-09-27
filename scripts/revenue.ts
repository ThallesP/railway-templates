// Revenue snapshot. Two sources:
//  - Railway `templateMetrics` (authenticated): lifetime, 30-day and 90-day
//    earnings for every template.
//  - Dispatcher (`dispatcherctl`): hourly cumulative earnings history for the
//    top five templates plus "Other", withdrawals, balance and auto-withdraw.
// Writes data/revenue/history/<date>.json, data/revenue/latest.json and the
// derived data/revenue/daily.json (earnings per template per complete day).
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { $ } from 'bun'
import { gql, gqlAuth, loadTemplates, revenueDailyPath, revenueDir, revenueHistoryFiles, revenueLatestPath, shiftDay, today } from './lib'

type Metrics = {
  totalEarnings: number
  earningsLast30Days: number
  earningsLast90Days: number
  totalDeployments: number
  deploymentsLast90Days: number
  activeDeployments: number
  templateHealth: number
  supportHealth: number
  eligibleForSupportBonus: boolean
}

export type RevenueSnapshot = {
  date: string
  sampledAt: string
  templates: Record<string, { id: string; name: string } & Metrics>
  dispatcher: null | {
    sampledAt: string
    totalPayout: { current: number; previous: number | null }
    balance: { availableCents: number; minimumCents: number } | null
    autoWithdraw: { enabled: boolean; schedule: string } | null
    withdrawals: { last30Cents: number; previous30Cents: number; lifetimeCents: number; lastPayoutAt: string | null; lastStatus: string | null; pendingCount: number } | null
    // date -> (code | "other") -> cumulative earnings at the last sample of that UTC day
    dayEnd: Record<string, Record<string, number>>
  }
}

export type Daily = {
  codes: string[]
  // date -> code -> earnings that day (null when no source covers that template on that day), plus total
  rows: Record<string, { byCode: Record<string, number | null>; total: number; source: 'dispatcher' | 'own' | 'mixed' }>
}

const dispatcherJson = async <T>(args: string[]): Promise<T | null> => {
  const result = await $`dispatcherctl --compact ${args}`.quiet().nothrow()
  if (result.exitCode !== 0) {
    console.error(`dispatcherctl ${args.join(' ')}: ${result.stderr.toString().trim() || `exit ${result.exitCode}`}`)
    return null
  }
  return (await new Response(result.stdout).json().catch(() => null)) as T | null
}

type DispatcherTemplates = { sampledAt: string; templates: { templateId: string; code: string }[] }
type DispatcherSummary = { sampledAt: string; totalPayout: { current: number; previous: number | null } }
type DispatcherSeries = { series: { key: string; name: string }[]; points: { sampledAt: string; values: Record<string, number> }[] }
type DispatcherAccounts = { availableBalance: number; minimumBalance: number }
type DispatcherSettings = { enabled: boolean; schedule: string }
type DispatcherPayouts = {
  window: { totalCents: number; previousCents: number }
  totals: { lifetimeCents: number; lastPayoutAt: string | null; pendingCount: number }
  payouts: { createdAt: string; status: string }[]
}

const collectDispatcher = async (): Promise<RevenueSnapshot['dispatcher']> => {
  const summary = await dispatcherJson<DispatcherSummary>(['summary'])
  if (!summary) return null
  const templates = await dispatcherJson<DispatcherTemplates>(['templates'])
  const series = await dispatcherJson<DispatcherSeries>(['get', '/api/analytics/payout?days=365'])
  const accounts = await dispatcherJson<DispatcherAccounts>(['withdraw-accounts'])
  const settings = await dispatcherJson<DispatcherSettings>(['withdraw-settings'])
  const payouts = await dispatcherJson<DispatcherPayouts>(['get', '/api/payouts?days=30'])

  const codeById = new Map((templates?.templates ?? []).map((t) => [t.templateId, t.code]))
  const dayEnd: Record<string, Record<string, number>> = {}
  for (const point of series?.points ?? []) {
    const day = point.sampledAt.slice(0, 10)
    const row: Record<string, number> = {}
    for (const [key, value] of Object.entries(point.values)) row[key === 'other' ? 'other' : (codeById.get(key) ?? key)] = value
    dayEnd[day] = row // points are chronological, the last sample of the day wins
  }

  return {
    sampledAt: summary.sampledAt,
    totalPayout: summary.totalPayout,
    balance: accounts ? { availableCents: accounts.availableBalance, minimumCents: accounts.minimumBalance } : null,
    autoWithdraw: settings ? { enabled: settings.enabled, schedule: settings.schedule } : null,
    withdrawals: payouts
      ? {
          last30Cents: payouts.window.totalCents,
          previous30Cents: payouts.window.previousCents,
          lifetimeCents: payouts.totals.lifetimeCents,
          lastPayoutAt: payouts.totals.lastPayoutAt,
          lastStatus: payouts.payouts[0]?.status ?? null,
          pendingCount: payouts.totals.pendingCount,
        }
      : null,
    dayEnd,
  }
}

const metricsQuery = `query m($id: String!) { templateMetrics(id: $id) {
  totalEarnings earningsLast30Days earningsLast90Days totalDeployments deploymentsLast90Days
  activeDeployments templateHealth supportHealth eligibleForSupportBonus } }`

const round2 = (n: number) => Math.round(n * 100) / 100

// Rebuilds daily.json from every history file. Two sources, both as
// "cumulative at day end minus cumulative at the previous day end", and only
// between consecutive calendar days (a gap produces no row, not a doubled one):
//  - Dispatcher's hourly history for the top templates plus "other", merged
//    across every snapshot so an outage does not erase older days;
//  - this job's own snapshots, which cover every template and are labelled with
//    the day the 24 hours mostly belong to (the run is at 09:17 UTC).
export const buildDaily = async (latest: RevenueSnapshot, codes: string[]): Promise<Daily> => {
  const files = await revenueHistoryFiles()
  const snapshots: RevenueSnapshot[] = []
  for (const file of files) {
    const snap = (await Bun.file(file).json().catch(() => null)) as RevenueSnapshot | null
    if (snap) snapshots.push(snap)
  }
  if (!snapshots.some((s) => s.date === latest.date)) snapshots.push(latest)
  snapshots.sort((a, b) => a.date.localeCompare(b.date))

  const own: Record<string, Record<string, number>> = {}
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1]
    const snap = snapshots[i]
    if (shiftDay(prev.date, 1) !== snap.date) continue
    const row: Record<string, number> = {}
    for (const code of codes) {
      const now = snap.templates[code]?.totalEarnings
      const before = prev.templates[code]?.totalEarnings
      if (now === undefined || before === undefined) continue
      row[code] = round2(now - before)
    }
    own[prev.date] = row
  }

  const dayEnd: Record<string, Record<string, number>> = {}
  for (const snap of snapshots) Object.assign(dayEnd, snap.dispatcher?.dayEnd ?? {})
  const fromDispatcher: Record<string, Record<string, number>> = {}
  for (const day of Object.keys(dayEnd).sort()) {
    const prev = dayEnd[shiftDay(day, -1)]
    const cur = dayEnd[day]
    if (!prev) continue
    const keys = Object.keys(cur)
    const complete = keys.length > 0 && keys.every((k) => prev[k] !== undefined) && Object.keys(prev).every((k) => cur[k] !== undefined)
    if (!complete) continue
    const row: Record<string, number> = {}
    for (const key of keys) row[key] = round2(cur[key] - prev[key])
    fromDispatcher[day] = row
  }

  const current = today()
  const dates = [...new Set([...Object.keys(own), ...Object.keys(fromDispatcher)])].filter((d) => d < current).sort()
  const rows: Daily['rows'] = {}
  for (const date of dates) {
    const d = fromDispatcher[date]
    const o = own[date]
    const byCode: Record<string, number | null> = {}
    let usedDispatcher = false
    let usedOwn = false
    for (const code of codes) {
      if (d?.[code] !== undefined) {
        byCode[code] = d[code]
        usedDispatcher = true
      } else if (o?.[code] !== undefined) {
        byCode[code] = o[code]
        usedOwn = true
      } else byCode[code] = null
    }
    // A complete Dispatcher row (top templates plus "other") is the whole workspace; otherwise our own row is.
    const total = d ? round2(Object.values(d).reduce((a, b) => a + b, 0)) : round2(Object.values(byCode).reduce<number>((a, b) => a + (b ?? 0), 0))
    rows[date] = { byCode, total, source: usedDispatcher && usedOwn ? 'mixed' : usedDispatcher ? 'dispatcher' : 'own' }
  }
  return { codes, rows }
}

const main = async () => {
  const templates = await loadTemplates()
  const snapshot: RevenueSnapshot = { date: today(), sampledAt: new Date().toISOString(), templates: {}, dispatcher: null }

  for (const { meta } of templates) {
    const info = await gql<{ template: { id: string; name: string } | null }>(`query t($code: String!) { template(code: $code) { id name } }`, { code: meta.code })
    const id = info?.template?.id
    if (!id) {
      console.error(`${meta.code}: could not resolve template id, revenue snapshot not written`)
      process.exit(1)
    }
    const data = await gqlAuth<{ templateMetrics: Metrics | null }>(metricsQuery, { id })
    const m = data?.templateMetrics
    if (!m) {
      console.error(`${meta.code}: templateMetrics unavailable, revenue snapshot not written`)
      process.exit(1)
    }
    snapshot.templates[meta.code] = { id, name: info.template?.name ?? meta.name, ...m }
  }

  snapshot.dispatcher = await collectDispatcher()
  if (!snapshot.dispatcher) console.error('Dispatcher unavailable; Railway metrics still recorded')

  await mkdir(join(revenueDir, 'history'), { recursive: true })
  const json = JSON.stringify(snapshot, null, 2)
  await Bun.write(join(revenueDir, 'history', `${snapshot.date}.json`), json)
  await Bun.write(revenueLatestPath, json)

  const daily = await buildDaily(snapshot, templates.map((t) => t.meta.code))
  await Bun.write(revenueDailyPath, JSON.stringify(daily, null, 2))

  const total30 = round2(Object.values(snapshot.templates).reduce((a, t) => a + t.earningsLast30Days, 0))
  const lifetime = round2(Object.values(snapshot.templates).reduce((a, t) => a + t.totalEarnings, 0))
  const days = Object.keys(daily.rows)
  console.log(`revenue: ${Object.keys(snapshot.templates).length} templates, last 30 days $${total30}, lifetime $${lifetime}, daily rows ${days.length} (${days[0] ?? '-'} to ${days.at(-1) ?? '-'}), dispatcher ${snapshot.dispatcher ? 'ok' : 'unavailable'}`)
}

if (import.meta.main) await main()
