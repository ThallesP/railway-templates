# Deploy and Host n8n on Railway

n8n is a fair-code workflow automation tool: you build automations in a visual, node-based editor, connect hundreds of apps and APIs, and drop into JavaScript or Python when a node is not enough. This template runs n8n on PostgreSQL, the database n8n itself recommends for team and production use, with the webhook URL, encryption key and database connection already wired.

![n8n workflow editor with an automation open on the canvas](https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-screenshot-readme.png)

## About Hosting n8n

The template deploys two services. **n8n** runs the official `n8nio/n8n` image behind a public Railway domain with a `/healthz` health check, so a new deploy only receives traffic once it answers. **Postgres** runs Railway's SSL-enabled PostgreSQL image on a persistent volume. n8n reaches it over Railway's private network, so database traffic never leaves the project and is not billed as egress.

Everything n8n needs to come up is set for you: `DB_TYPE=postgresdb` with host, port, user, password and database name referenced from the Postgres service, `WEBHOOK_URL` pointing at the service's public domain so webhook and OAuth callbacks resolve to the right place, and `N8N_ENCRYPTION_KEY` generated at deploy time so stored credentials survive restarts and redeploys. On first visit n8n asks you to create the owner account. There is no password to look up.

By default n8n uses SQLite. Its own hosting docs say: "If you're setting n8n up for a team or a production environment, consider a more robust database like Postgres rather than the built-in default." That is what this template does.

## Common Use Cases

- Connect SaaS tools without code: sync leads from forms to a CRM, post alerts to Slack or Discord, file tickets from incoming email
- Run scheduled jobs and webhook-triggered pipelines against your own APIs and databases
- Build AI workflows with the LangChain nodes, calling models and tools from a self-hosted instance that keeps prompts and data on your side
- Replace per-task automation subscriptions with one instance you control

## Dependencies for n8n Hosting

- `n8nio/n8n`, the official image, untagged so a redeploy picks up the latest release
- PostgreSQL (`ghcr.io/railwayapp-templates/postgres-ssl`) with a Railway volume mounted at `/var/lib/postgresql/data`
- A Railway public domain for the editor and webhooks, and the private network between the two services

### Deployment Dependencies

- [n8n documentation](https://docs.n8n.io/)
- [n8n hosting and configuration](https://docs.n8n.io/hosting/)
- [Environment variables reference](https://docs.n8n.io/hosting/configuration/environment-variables/)
- [n8n on GitHub](https://github.com/n8n-io/n8n)

### Implementation Details

Variables set on the n8n service, all of them editable after deploy:

```
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=${{Postgres.PGHOST}}        # private domain, not the public proxy
DB_POSTGRESDB_PORT=${{Postgres.PGPORT}}
DB_POSTGRESDB_USER=${{Postgres.POSTGRES_USER}}
DB_POSTGRESDB_PASSWORD=${{Postgres.POSTGRES_PASSWORD}}
DB_POSTGRESDB_DATABASE=${{Postgres.POSTGRES_DB}}
WEBHOOK_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
N8N_ENCRYPTION_KEY=${{secret()}}
N8N_PORT=5678
```

Newer n8n releases call the webhook variable `N8N_WEBHOOK_URL`; the old name still works and only logs a deprecation warning. The n8n service has no volume of its own: workflows, credentials and executions live in PostgreSQL, and the encryption key lives in the variable above. If your workflows move large files, set `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` and attach a volume at `/home/node/.n8n`.

## Why Deploy n8n on Railway?

Both services, their networking and their secrets are created in one deploy, and Railway's TemplateCI runs this template on a schedule to confirm it still comes up healthy. Upgrading is a redeploy. Scaling is a slider on the service. When you outgrow a single instance, n8n's queue mode with Redis and workers is a configuration change, not a migration, because the data is already in PostgreSQL.

## Frequently Asked Questions

### How much does it cost to run n8n on Railway?

Railway bills actual usage: $10 per GB of RAM per month, $20 per vCPU per month and $0.15 per GB of volume storage, on top of the Hobby plan's $5 subscription that already includes $5 of usage. Over the last 30 days our own deployment of this template averaged about 0.45 GB of RAM for n8n (peaking near 0.9 GB while running workflows) and 0.31 GB for PostgreSQL, with negligible CPU and 1.3 GB of disk. That is roughly $8 a month for a lightly used instance. A busy instance running workflows around the clock costs more; the [pricing page](https://docs.railway.com/reference/pricing) has the full rates.

### Does n8n stay running, or does it sleep?

It stays running by default, which is what scheduled workflows and incoming webhooks need. Railway's serverless option can pause a service after ten minutes without traffic, but leave it off for n8n unless you only use manual triggers.

### Where is my data, and what should I back up?

Workflows, credentials and execution history are in the PostgreSQL service on its volume. Credentials are encrypted with `N8N_ENCRYPTION_KEY`; if that value is lost the stored credentials cannot be decrypted, so keep a copy of it together with your database backups.

### How do I update n8n?

Redeploy the n8n service. The image is untagged, so Railway pulls the current release. Read the n8n release notes first when a major version changes.

### Can I use my own domain?

Yes. Add a custom domain to the n8n service in its settings. `WEBHOOK_URL` follows the service's public domain, so webhooks and OAuth redirects keep working; if an integration still shows the old address, set the variable to your domain explicitly.

### Do I need queue mode or workers?

Not to start. A single instance handles most personal and small-team workloads. When executions start queuing, n8n's queue mode adds Redis and worker processes; the [n8n scaling docs](https://docs.n8n.io/hosting/scaling/) describe the setup, and this template's PostgreSQL database carries over unchanged.
