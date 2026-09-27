// Pushes templates/* to Railway through the CLI, but only for templates whose
// live description, category, image or overview differs from the repo.
// `--dry-run` prints the diff summary without publishing. Names cannot be set
// through the CLI or API; a mismatch is reported for a manual dashboard edit.
import { $ } from 'bun'
import { join } from 'node:path'
import { gql, loadTemplates } from './lib'

type Live = { name: string; description: string | null; category: string | null; image: string | null; readme: string | null; status: string }

const query = `query t($code: String!) { template(code: $code) { name description category image readme status } }`

// Railway strips HTML tags and trailing whitespace from the stored overview; compare what it would keep.
const normalize = (md: string) => md.replace(/<[^>]*>/g, '').split('\n').map((l) => l.trimEnd()).join('\n').trim()

const dryRun = process.argv.includes('--dry-run')
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length)

const main = async () => {
  const templates = await loadTemplates()
  let published = 0
  for (const { dir, meta, overview } of templates) {
    if (only && meta.code !== only) continue
    const data = await gql<{ template: Live | null }>(query, { code: meta.code })
    const live = data?.template
    if (!live) {
      console.error(`${meta.code}: could not read live template, skipping`)
      continue
    }
    if (live.status !== 'PUBLISHED') {
      console.log(`${meta.code}: status ${live.status}, skipping`)
      continue
    }
    if (live.name !== meta.name) console.log(`${meta.code}: name is "${live.name}", target "${meta.name}" (rename manually at https://railway.com/workspace/templates)`)

    const changes: string[] = []
    if ((live.description ?? '') !== meta.description) changes.push('description')
    if ((live.category ?? '') !== meta.category) changes.push('category')
    if ((live.image ?? '') !== (meta.image ?? '')) changes.push('image')
    if (normalize(live.readme ?? '') !== normalize(overview)) changes.push('overview')
    if (!changes.length) {
      console.log(`${meta.code}: up to date`)
      continue
    }
    console.log(`${meta.code}: ${dryRun ? 'would publish' : 'publishing'} ${changes.join(', ')}`)
    if (dryRun) continue

    const readmeFile = join(dir, 'overview.md')
    const image = meta.image ?? 'none'
    const result = await $`railway templates update ${meta.code} --category ${meta.category} --description ${meta.description} --readme-file ${readmeFile} --image ${image} --json`.quiet().nothrow()
    if (result.exitCode !== 0) {
      console.error(`${meta.code}: publish failed\n${result.stderr.toString()}`)
      process.exitCode = 1
      continue
    }
    published += 1
  }
  console.log(`${published} template(s) published`)
}

await main()
