// Turns data/latest.json plus the previous snapshot into reports/<date>.md:
// rank, health and deploy deltas, validation failures, revenue and what it
// did since each change we made, page SEO fields, and a list of things that
// need a human.
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { historyFiles, latestSnapshotPath, loadTemplates, readChanges, reportsDir, revenueDailyPath, revenueHistoryFiles, revenueLatestPath, shiftDay, today } from './lib'
import type { Daily, RevenueSnapshot } from './revenue'
import type { Snapshot } from './snapshot'

const delta = (now: number | null, before: number | null | undefined) => {
  if (now === null || before === null || before === undefined) return ''
  const d = now - before
  if (d === 0) return ''
  return d > 0 ? ` (+${d})` : ` (${d})`
}

const usd = (n: number | null | undefined) => (n === null || n === undefined ? '-' : `$${n.toFixed(2)}`)
const cents = (c: number | null | undefined) => (c === null || c === undefined ? '-' : `$${(c / 100).toFixed(2)}`)

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

// Calendar window of `n` days ending `offset` days before yesterday (the last complete UTC day).
const windowDates = (n: number, offset = 0) => {
  const end = shiftDay(today(), -1 - offset)
  return Array.from({ length: n }, (_, i) => shiftDay(end, -i))
}

// Average per day over a calendar window, for one code or the total; days without a row are skipped, not backfilled.
const average = (daily: Daily | null, code: string | 'total', n: number, offset = 0) => {
  if (!daily) return { avg: null as number | null, days: 0, nonzero: 0 }
  const values = windowDates(n, offset)
    .map((d) => daily.rows[d])
    .filter((row): row is Daily['rows'][string] => row !== undefined)
    .map((row) => (code === 'total' ? row.total : row.byCode[code]))
    .filter((v): v is number => v !== null)
  return { avg: mean(values), days: values.length, nonzero: values.filter((v) => v > 0).length }
}

const main = async () => {
  const latest = (await Bun.file(latestSnapshotPath).json()) as Snapshot
  const files = await historyFiles()
  const previousFile = files.filter((f) => !f.endsWith(`${latest.date}.json`)).at(-1)
  const previous = previousFile ? ((await Bun.file(previousFile).json()) as Snapshot) : null
  const templates = await loadTemplates()
  const revenue = (await Bun.file(revenueLatestPath).json().catch(() => null)) as RevenueSnapshot | null
  const daily = (await Bun.file(revenueDailyPath).json().catch(() => null)) as Daily | null
  const changes = await readChanges()

  const lines: string[] = [`# Template report ${latest.date}`, '']
  if (previous) lines.push(`Compared with ${previous.date}.`, '')
  const attention: string[] = []

  lines.push('| Template | Health | Active | Recent | Validation | Ranks |', '|---|---|---|---|---|---|')
  for (const { meta } of templates) {
    const t = latest.templates[meta.code]
    if (!t) continue
    const p = previous?.templates[meta.code]
    const ranks = t.ranks
      .map((r) => {
        const before = p?.ranks.find((x) => x.keyword === r.keyword)?.position ?? null
        const now = r.position
        const moved = before !== null && now !== null && before !== now ? ` (was ${before})` : ''
        if (r.total === null) return `${r.keyword}: unavailable`
        return `${r.keyword}: ${now ?? '-'}/${r.total}${moved}`
      })
      .join('<br>')
    const validation = `${t.manifest.status}${t.manifest.successRate30d === null ? '' : ` ${Math.round(t.manifest.successRate30d * 100)}%`}`
    lines.push(
      `| ${t.live.name} (${meta.code}) | ${t.live.health ?? '-'}${delta(t.live.health, p?.live.health)} | ${t.live.activeProjects}${delta(t.live.activeProjects, p?.live.activeProjects)} | ${t.live.recentProjects}${delta(t.live.recentProjects, p?.live.recentProjects)} | ${validation} | ${ranks} |`,
    )

    if (t.live.name !== meta.name) attention.push(`${meta.code}: live name is "${t.live.name}", target is "${meta.name}" (scripts/rename.ts will apply it on the next run)`)
    if (t.manifest.failedChecks.length) attention.push(`${meta.code}: validation failing: ${t.manifest.failedChecks.join('; ')}`)
    if (t.live.health !== null && t.live.health < 70) attention.push(`${meta.code}: health ${t.live.health} puts it in the lowest search tier`)
    if (p?.live.health !== null && p?.live.health !== undefined && t.live.health !== null && t.live.health < p.live.health - 5) attention.push(`${meta.code}: health fell from ${p.live.health} to ${t.live.health}`)
    if (t.icon.url && t.icon.status !== 200) attention.push(`${meta.code}: icon ${t.icon.url} returns ${t.icon.status}`)
    if (!t.icon.url) attention.push(`${meta.code}: no icon set`)
    if (t.page.status !== 200) attention.push(`${meta.code}: page returned ${t.page.status}`)
    if (t.page.status === 200 && t.page.inSitemap === false) attention.push(`${meta.code}: canonical ${t.page.canonical} is not in railway.com/templates-sitemap.xml`)
    if (p && p.page.canonical && t.page.canonical && p.page.canonical !== t.page.canonical) attention.push(`${meta.code}: canonical changed from ${p.page.canonical} to ${t.page.canonical} (expected after a rename)`)
    if (p && t.thread.replies !== null && p.thread.replies !== null && t.thread.replies > p.thread.replies) attention.push(`${meta.code}: ${t.thread.replies - p.thread.replies} new reply(ies) on https://station.railway.com/templates/${t.thread.slug}`)
    for (const r of t.ranks) {
      if (r.total === null) continue
      const before = p?.ranks.find((x) => x.keyword === r.keyword)?.position ?? null
      if (before !== null && r.position !== null && r.position > before) attention.push(`${meta.code}: dropped from ${before} to ${r.position} for "${r.keyword}"`)
      if (before !== null && r.position === null) attention.push(`${meta.code}: no longer in the top ${r.total} for "${r.keyword}"`)
    }
  }

  lines.push('', '## Revenue', '')
  if (!revenue) {
    lines.push('No revenue snapshot (scripts/revenue.ts has not run successfully).')
    attention.push('revenue: no snapshot available')
  } else {
    if (revenue.date !== latest.date) attention.push(`revenue: snapshot is from ${revenue.date}, today's collection failed`)
    if (!revenue.dispatcher) attention.push('revenue: Dispatcher unreachable through dispatcherctl (balance, withdrawals and daily history missing)')
    const yesterday = average(daily, 'total', 1)
    const week = average(daily, 'total', 7)
    const prevWeek = average(daily, 'total', 7, 7)
    const total30 = Object.values(revenue.templates).reduce((a, t) => a + t.earningsLast30Days, 0)
    const total90 = Object.values(revenue.templates).reduce((a, t) => a + t.earningsLast90Days, 0)
    const lifetime = Object.values(revenue.templates).reduce((a, t) => a + t.totalEarnings, 0)
    const lastDay = windowDates(1)[0]
    lines.push(`Earnings are Railway kickbacks in USD. Daily figures come from Dispatcher's hourly history (top templates) and this job's own snapshots (every template); "last 30/90 days" and lifetime come from Railway's templateMetrics.`, '')
    lines.push(`- Last complete day (${lastDay ?? '-'}): ${usd(yesterday.avg)}`)
    lines.push(`- Last 7 days: ${usd(week.avg)}/day over ${week.days} days (previous 7: ${usd(prevWeek.avg)}/day)`)
    lines.push(`- Last 30 days: ${usd(total30)} (${usd(total30 / 30)}/day), last 90 days: ${usd(total90)}, lifetime: ${usd(lifetime)}`)
    const d = revenue.dispatcher
    if (d) {
      const weekly = d.totalPayout.previous === null ? null : d.totalPayout.current - d.totalPayout.previous
      lines.push(`- Dispatcher: workspace total ${usd(d.totalPayout.current)}, +${usd(weekly)} in the last 7 days`)
      if (d.balance) lines.push(`- Balance available: ${cents(d.balance.availableCents)} (cash withdrawals start at ${cents(d.balance.minimumCents)}); auto-withdraw ${d.autoWithdraw?.enabled ? `on, schedule \`${d.autoWithdraw.schedule}\`` : 'off'}`)
      if (d.withdrawals) lines.push(`- Withdrawn: ${cents(d.withdrawals.last30Cents)} in the last 30 days (previous 30: ${cents(d.withdrawals.previous30Cents)}), ${cents(d.withdrawals.lifetimeCents)} lifetime, last payout ${d.withdrawals.lastPayoutAt?.slice(0, 10) ?? '-'} ${d.withdrawals.lastStatus ?? ''}`)
      if (d.balance && d.autoWithdraw && !d.autoWithdraw.enabled && d.balance.availableCents >= d.balance.minimumCents) attention.push(`revenue: ${cents(d.balance.availableCents)} available and auto-withdraw is off`)
      if (d.withdrawals?.lastStatus && d.withdrawals.lastStatus !== 'COMPLETED') attention.push(`revenue: last payout status is ${d.withdrawals.lastStatus}`)
      if (d.withdrawals && d.withdrawals.pendingCount > 0) attention.push(`revenue: ${d.withdrawals.pendingCount} payout(s) pending`)
    }
    if (week.days >= 5 && prevWeek.days >= 5 && week.avg !== null && prevWeek.avg !== null && prevWeek.avg >= 20 && week.avg < prevWeek.avg * 0.7) attention.push(`revenue: workspace earnings fell to ${usd(week.avg)}/day from ${usd(prevWeek.avg)}/day the week before`)

    lines.push('', '| Template | Last day | 7d avg/day | Prev 7d avg/day | Last 30d | Last 90d | Lifetime | Health |', '|---|---|---|---|---|---|---|---|')
    const ordered = [...templates].sort((a, b) => (revenue.templates[b.meta.code]?.earningsLast30Days ?? 0) - (revenue.templates[a.meta.code]?.earningsLast30Days ?? 0))
    for (const { meta } of ordered) {
      const r = revenue.templates[meta.code]
      if (!r) continue
      const day = average(daily, meta.code, 1)
      const w = average(daily, meta.code, 7)
      const pw = average(daily, meta.code, 7, 7)
      lines.push(`| ${r.name} (${meta.code}) | ${usd(day.avg)} | ${usd(w.avg)}${w.days && w.days < 7 ? ` (${w.days}d)` : ''} | ${usd(pw.avg)}${pw.days && pw.days < 7 ? ` (${pw.days}d)` : ''} | ${usd(r.earningsLast30Days)} | ${usd(r.earningsLast90Days)} | ${usd(r.totalEarnings)} | ${r.templateHealth} |`)
      // Kickbacks for small templates arrive as a few lumpy credits, so only steady earners
      // (paid on at least 5 of the previous 14 days) can trigger a drop alert.
      const w14 = average(daily, meta.code, 14)
      const pw14 = average(daily, meta.code, 14, 14)
      if (w14.days >= 10 && pw14.days >= 10 && pw14.nonzero >= 5 && w14.avg !== null && pw14.avg !== null && pw14.avg >= 1 && w14.avg < pw14.avg * 0.6) attention.push(`${meta.code}: earnings fell to ${usd(w14.avg)}/day over 14 days from ${usd(pw14.avg)}/day the 14 days before`)
    }

    lines.push('', '### Since the changes', '')
    lines.push('Baseline is the 30-day average per day as of the first change; "since" averages the complete days after the last change. Daily kickbacks are lumpy, so nothing is concluded before 7 days.', '')
    const revenueFiles = await revenueHistoryFiles()
    const byCode = new Map<string, typeof changes>()
    for (const c of changes) byCode.set(c.code, [...(byCode.get(c.code) ?? []), c])
    if (!byCode.size) lines.push('No changes logged yet.')
    else {
      lines.push('| Template | Changes | Baseline $/day | Since $/day | Days since | Verdict |', '|---|---|---|---|---|---|')
      for (const { meta } of ordered) {
        const list = byCode.get(meta.code)
        if (!list) continue
        const dates = list.map((c) => c.date).sort()
        const first = dates[0]
        const last = dates.at(-1) ?? first
        const fileDate = (f: string) => f.slice(-15, -5)
        const baselineFile = [...revenueFiles].reverse().find((f) => fileDate(f) <= first)
        const baselineSnap = baselineFile ? ((await Bun.file(baselineFile).json().catch(() => null)) as RevenueSnapshot | null) : null
        const baseline = baselineSnap?.templates[meta.code] ? baselineSnap.templates[meta.code].earningsLast30Days / 30 : null
        const after = daily ? Object.keys(daily.rows).filter((d) => d > last).sort() : []
        const values = after.map((d) => daily!.rows[d].byCode[meta.code]).filter((v): v is number => v !== null)
        const since = mean(values)
        const kinds = [...new Set(list.map((c) => c.kind))].join(', ')
        const verdict = values.length < 7 ? `too early (${values.length} day${values.length === 1 ? '' : 's'})` : baseline === null || baseline === 0 ? 'no baseline' : `${since! >= baseline ? '+' : ''}${Math.round(((since! - baseline) / baseline) * 100)}%`
        lines.push(`| ${meta.name} (${meta.code}) | ${kinds} (${first}${last !== first ? ` to ${last}` : ''}) | ${usd(baseline)} | ${usd(since)} | ${values.length} | ${verdict} |`)
      }
    }
  }

  lines.push('', '## Needs attention', '')
  lines.push(...(attention.length ? attention.map((a) => `- ${a}`) : ['- nothing']))

  lines.push('', '## Page fields', '')
  for (const { meta } of templates) {
    const t = latest.templates[meta.code]
    if (!t) continue
    lines.push(`### ${t.live.name} (${meta.code})`, '', `- title: ${t.page.title}`, `- canonical: ${t.page.canonical}${t.page.inSitemap === undefined ? '' : t.page.inSitemap ? ' (in sitemap)' : ' (NOT in sitemap)'}`, `- h1: ${t.page.h1}`, `- description (${t.page.description.length} chars): ${t.page.description}`, `- overview words: ${t.live.readmeWords}`, `- icon: ${t.icon.url ?? 'none'} (${t.icon.status || 'n/a'})`, '')
    for (const r of t.ranks) lines.push(`- "${r.keyword}" top 3: ${r.top.join(' | ')}`)
    lines.push('')
  }

  await mkdir(reportsDir, { recursive: true })
  const path = join(reportsDir, `${latest.date}.md`)
  await Bun.write(path, lines.join('\n'))
  console.log(lines.slice(0, lines.indexOf('## Page fields')).join('\n'))
  console.log(`\nwritten ${path}`)
}


await main()
