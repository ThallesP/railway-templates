// Lints templates/*: metadata shape, description length, the overview
// structure Railway asks for, and that every link and image still resolves.
// Exits non-zero on errors so the daily job never publishes a broken page.
import { loadTemplates, probe } from './lib'

const categories = ['AI/ML', 'Analytics', 'Authentication', 'Automation', 'Blogs', 'Bots', 'CMS', 'Observability', 'Other', 'Starters', 'Storage', 'Queues']

const requiredHeadings = ['## About Hosting', '## Common Use Cases', '## Dependencies for', '## Why Deploy']

const main = async () => {
  const templates = await loadTemplates()
  const errors: string[] = []
  const warnings: string[] = []
  const probed = new Map<string, Promise<{ ok: boolean; status: number }>>()
  const check = (url: string) => {
    const existing = probed.get(url)
    if (existing) return existing
    const p = probe(url)
    probed.set(url, p)
    return p
  }

  for (const { meta, overview } of templates) {
    const tag = meta.code
    if (!meta.name.trim()) errors.push(`${tag}: empty name`)
    if (/\bw\//.test(meta.name)) errors.push(`${tag}: name uses "w/", write "with"`)
    if (!categories.includes(meta.category)) errors.push(`${tag}: unknown category "${meta.category}"`)
    if (meta.description.length > 75) errors.push(`${tag}: description is ${meta.description.length} chars (Railway allows 75)`)
    if (meta.description.length < 40) warnings.push(`${tag}: description is short (${meta.description.length} chars)`)
    if (!meta.keywords.length) warnings.push(`${tag}: no keywords to track`)
    if (!overview.startsWith(`# Deploy and Host ${meta.name} on Railway`)) errors.push(`${tag}: overview must start with "# Deploy and Host ${meta.name} on Railway"`)
    for (const h of requiredHeadings) if (!overview.includes(h)) errors.push(`${tag}: overview is missing "${h}"`)
    if (!/^## (FAQ|Frequently Asked Questions)/m.test(overview)) warnings.push(`${tag}: overview has no FAQ section`)
    if (/<h[1-6]/i.test(overview)) errors.push(`${tag}: use markdown headings, not HTML`)

    for (const m of overview.matchAll(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g)) {
      if (!m[1].trim()) errors.push(`${tag}: image without alt text: ${m[2]}`)
    }
    const urls = new Set<string>()
    for (const m of overview.matchAll(/\]\((https?:\/\/[^)\s]+)/g)) urls.add(m[1])
    if (meta.image) urls.add(meta.image)
    for (const url of urls) {
      const res = await check(url)
      if (!res.ok) errors.push(`${tag}: ${url} returned ${res.status}`)
    }
  }

  for (const w of warnings) console.log(`warn  ${w}`)
  for (const e of errors) console.log(`error ${e}`)
  console.log(`${templates.length} templates, ${errors.length} errors, ${warnings.length} warnings`)
  if (errors.length) process.exit(1)
}

await main()
