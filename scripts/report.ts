// Turns data/latest.json plus the previous snapshot into reports/<date>.md:
// rank, health and deploy deltas, validation failures, page SEO fields and a
// list of things that need a human (renames, config fixes, new community replies).
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { historyFiles, latestSnapshotPath, loadTemplates, reportsDir } from './lib'
import type { Snapshot } from './snapshot'

const delta = (now: number | null, before: number | null | undefined) => {
  if (now === null || before === null || before === undefined) return ''
  const d = now - before
  if (d === 0) return ''
  return d > 0 ? ` (+${d})` : ` (${d})`
}

const main = async () => {
  const latest = (await Bun.file(latestSnapshotPath).json()) as Snapshot
  const files = await historyFiles()
  const previousFile = files.filter((f) => !f.endsWith(`${latest.date}.json`)).at(-1)
  const previous = previousFile ? ((await Bun.file(previousFile).json()) as Snapshot) : null
  const templates = await loadTemplates()

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

    if (t.live.name !== meta.name) attention.push(`${meta.code}: live name is "${t.live.name}", target is "${meta.name}" (rename in the dashboard, not available through the API)`)
    if (t.manifest.failedChecks.length) attention.push(`${meta.code}: validation failing: ${t.manifest.failedChecks.join('; ')}`)
    if (t.live.health !== null && t.live.health < 70) attention.push(`${meta.code}: health ${t.live.health} puts it in the lowest search tier`)
    if (t.icon.url && t.icon.status !== 200) attention.push(`${meta.code}: icon ${t.icon.url} returns ${t.icon.status}`)
    if (!t.icon.url) attention.push(`${meta.code}: no icon set`)
    if (t.page.status !== 200) attention.push(`${meta.code}: page returned ${t.page.status}`)
    if (p && t.thread.replies !== null && p.thread.replies !== null && t.thread.replies > p.thread.replies) attention.push(`${meta.code}: ${t.thread.replies - p.thread.replies} new reply(ies) on https://station.railway.com/templates/${t.thread.slug}`)
    for (const r of t.ranks) {
      if (r.total === null) continue
      const before = p?.ranks.find((x) => x.keyword === r.keyword)?.position ?? null
      if (before !== null && r.position !== null && r.position > before) attention.push(`${meta.code}: dropped from ${before} to ${r.position} for "${r.keyword}"`)
      if (before !== null && r.position === null) attention.push(`${meta.code}: no longer in the top ${r.total} for "${r.keyword}"`)
    }
  }

  lines.push('', '## Needs attention', '')
  lines.push(...(attention.length ? attention.map((a) => `- ${a}`) : ['- nothing']))

  lines.push('', '## Page fields', '')
  for (const { meta } of templates) {
    const t = latest.templates[meta.code]
    if (!t) continue
    lines.push(`### ${t.live.name} (${meta.code})`, '', `- title: ${t.page.title}`, `- canonical: ${t.page.canonical}`, `- h1: ${t.page.h1}`, `- description (${t.page.description.length} chars): ${t.page.description}`, `- overview words: ${t.live.readmeWords}`, `- icon: ${t.icon.url ?? 'none'} (${t.icon.status || 'n/a'})`, '')
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
