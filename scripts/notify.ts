// Pushes what changed to the ntfy topic Dispatcher already notifies, so
// alerts land on the same phone:
//  - every day: attention items that were not in the previous report
//    (standing issues are not repeated), prefixed with yesterday's earnings;
//  - on Mondays: a digest with the week's earnings, the count of standing
//    issues, and the "since the changes" verdicts that are past the 7-day mark.
// Sends nothing when there is nothing new. `--dry-run` prints instead of posting.
// The topic URL comes from NTFY_TOPIC_URL or Dispatcher's first enabled ntfy target.
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { $ } from 'bun'
import { reportsDir, today } from './lib'

type Target = { kind: string; url: string; enabled: boolean }

const dryRun = process.argv.includes('--dry-run')

const topicUrl = async () => {
  const fromEnv = process.env.NTFY_TOPIC_URL ?? ''
  if (fromEnv) return fromEnv
  const result = await $`dispatcherctl --compact notifications`.quiet().nothrow()
  if (result.exitCode !== 0) return ''
  const targets = (await new Response(result.stdout).json().catch(() => null)) as Target[] | null
  return targets?.find((t) => t.kind === 'ntfy' && t.enabled)?.url ?? ''
}

const section = (md: string, heading: string, level = '##') => {
  const marker = `\n${level} ${heading}\n`
  const start = md.indexOf(marker)
  if (start === -1) return ''
  const rest = md.slice(start + marker.length)
  const end = rest.search(/\n#{2,3} /)
  return (end === -1 ? rest : rest.slice(0, end)).trim()
}

const bullets = (text: string) => text.split('\n').filter((l) => l.startsWith('- ') && l !== '- nothing').map((l) => l.slice(2))

const previousReport = async () => {
  const files = (await readdir(reportsDir).catch(() => [] as string[])).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f) && f !== `${today()}.md`).sort()
  const last = files.at(-1)
  return last ? Bun.file(join(reportsDir, last)).text().catch(() => '') : ''
}

const send = async (title: string, body: string, priority: number) => {
  if (dryRun) {
    console.log(`--- ${title} (priority ${priority})\n${body}\n`)
    return true
  }
  const url = await topicUrl()
  if (!url) {
    console.error('no ntfy topic available (set NTFY_TOPIC_URL or enable an ntfy target in Dispatcher)')
    return false
  }
  const res = await fetch(url, { method: 'POST', headers: { 'X-Title': title, 'X-Priority': String(priority), 'X-Tags': 'railway_car' }, body }).catch(() => null)
  if (!res?.ok) {
    console.error(`ntfy publish failed: ${res?.status ?? 'no response'}`)
    return false
  }
  return true
}

const main = async () => {
  const date = today()
  const report = await Bun.file(join(reportsDir, `${date}.md`)).text().catch(() => '')
  if (!report) {
    console.error('no report for today, nothing to send')
    return
  }
  const previous = await previousReport()
  const current = bullets(section(report, 'Needs attention'))
  const seen = new Set(bullets(section(previous, 'Needs attention')))
  const fresh = current.filter((item) => !seen.has(item))
  const revenue = section(report, 'Revenue')
  const revenueLines = revenue.split('\n').filter((l) => l.startsWith('- Last complete day') || l.startsWith('- Last 7 days')).map((l) => l.slice(2))

  let sent = 0
  if (fresh.length) {
    const urgent = fresh.some((l) => /fell|failed|unreachable|pending|no longer|returned \d/i.test(l))
    const ok = await send(`Templates ${date}: ${fresh.length} new item${fresh.length === 1 ? '' : 's'}`, [...revenueLines, '', ...fresh].join('\n'), urgent ? 4 : 3)
    if (!ok) process.exitCode = 1
    else sent += 1
  }

  const isMonday = new Date().getUTCDay() === 1
  if (isMonday) {
    const verdicts = section(report, 'Since the changes', '###')
      .split('\n')
      .filter((l) => l.startsWith('| ') && !l.startsWith('| Template') && !l.startsWith('|---') && !l.includes('too early'))
      .map((l) => l.split('|').map((c) => c.trim()).filter(Boolean))
      .map((cells) => `${cells[0]}: ${cells[2]} -> ${cells[3]}/day, ${cells[5]}`)
    const body = [...revenueLines, `Standing issues: ${current.length} (see reports/${date}.md)`, ...(verdicts.length ? ['', 'Since the changes:', ...verdicts] : [])].join('\n')
    const ok = await send(`Templates weekly ${date}`, body, 3)
    if (!ok) process.exitCode = 1
    else sent += 1
  }

  console.log(sent ? `sent ${sent} message(s); ${fresh.length} new item(s), ${current.length} standing` : `nothing new (${current.length} standing issue${current.length === 1 ? '' : 's'})`)
}

await main()
