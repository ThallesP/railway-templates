// Renames templates whose live name differs from meta.json, using the same
// change-set mutations the dashboard's template editor uses (stage a metadata
// patch, then apply it). These live on backboard's /graphql/internal endpoint,
// which needs the CLI's stored login token. `--dry-run` only reports.
import { appendChange, gql, loadTemplates, railwayToken } from './lib'

const internal = 'https://backboard.railway.com/graphql/internal'

const internalGql = async <T>(accessToken: string, query: string, variables: Record<string, unknown>): Promise<T | null> => {
  const res = await fetch(internal, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ query, variables }),
  }).catch(() => null)
  if (!res?.ok) return null
  const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string }[] } | null
  if (!body) return null
  if (body.errors?.length) {
    console.error(body.errors.map((e) => e.message).join('; '))
    return null
  }
  return body.data ?? null
}

type Live = { id: string; name: string; status: string }

const dryRun = process.argv.includes('--dry-run')

const main = async () => {
  const accessToken = await railwayToken()
  if (!accessToken) {
    console.error('no Railway token in ~/.railway/config.json, run `railway login`')
    process.exit(1)
  }
  const templates = await loadTemplates()
  let renamed = 0
  for (const { meta } of templates) {
    const data = await gql<{ template: Live | null }>(`query t($code: String!) { template(code: $code) { id name status } }`, { code: meta.code })
    const live = data?.template
    if (!live) {
      console.error(`${meta.code}: could not read live template, skipping`)
      continue
    }
    if (live.name === meta.name) continue
    console.log(`${meta.code}: ${dryRun ? 'would rename' : 'renaming'} "${live.name}" to "${meta.name}"`)
    if (dryRun) continue

    const staged = await internalGql<{ templateChangeSetStage: { id: string; status: string } }>(
      accessToken,
      `mutation s($id: String!, $patch: TemplatePatch!) { templateChangeSetStage(templateId: $id, patch: $patch) { id status } }`,
      { id: live.id, patch: { metadata: { name: meta.name } } },
    )
    const changeSetId = staged?.templateChangeSetStage.id
    if (!changeSetId) {
      console.error(`${meta.code}: staging failed`)
      process.exitCode = 1
      continue
    }
    const applied = await internalGql<{ templateChangeSetApply: { id: string; status: string } }>(
      accessToken,
      `mutation a($cs: String!) { templateChangeSetApply(changeSetId: $cs) { id status } }`,
      { cs: changeSetId },
    )
    if (applied?.templateChangeSetApply.status !== 'APPLIED') {
      console.error(`${meta.code}: apply failed (${applied?.templateChangeSetApply.status ?? 'no response'}), discarding change set ${changeSetId}`)
      await internalGql(accessToken, `mutation d($cs: String!) { templateChangeSetDiscard(changeSetId: $cs) { id status } }`, { cs: changeSetId })
      process.exitCode = 1
      continue
    }
    const check = await gql<{ template: Live | null }>(`query t($code: String!) { template(code: $code) { id name status } }`, { code: meta.code })
    if (check?.template?.name !== meta.name) {
      console.error(`${meta.code}: applied but live name is "${check?.template?.name ?? 'unknown'}"`)
      process.exitCode = 1
      continue
    }
    await appendChange({ code: meta.code, kind: 'rename', detail: `${live.name} -> ${meta.name}` })
    renamed += 1
  }
  console.log(`${renamed} template(s) renamed`)
}

await main()
