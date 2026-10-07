# Deploy and Host MillionSend on Railway

MillionSend is an open source email platform for transactional email and broadcasts, with an HTTP API that is wire-compatible with Resend: an existing integration moves over by changing the API key and base URL. It sends through your own AWS SES account. This template runs the dashboard, API and worker from the official image with PostgreSQL, the only datastore it needs.

![The MillionSend dashboard showing the Emails page, with each recipient's delivery status: delivered, opened, clicked, bounced](https://raw.githubusercontent.com/MillionSend/millionsend/main/.github/screenshots/emails.png)

## About Hosting MillionSend

The official `ghcr.io/millionsend/millionsend` image contains three processes, and `PROCESS` selects which one a container runs. The template splits them into three services, so each gets its own domain, logs and restarts:

- **MillionSend** (`PROCESS=web`) is the dashboard on port 3000, with a health check on `/login`. It also serves the open and click tracking links and the hosted unsubscribe pages.
- **MillionSend API** (`PROCESS=api`) is the REST API on port 3001, with a health check on `/health`. SDKs, HTTP integrations and MCP clients talk to this domain.
- **MillionSend Worker** (`PROCESS=worker`) sends queued mail, runs broadcasts and scheduled jobs, and long-polls the SQS queue for SES delivery, bounce and complaint events. It needs no domain.
- **Postgres** is Railway's SSL-enabled PostgreSQL 17 on a volume. It also holds the job queue (pg-boss), so there is no Redis. It starts with `max_connections=200`, as MillionSend's own compose file does, because the three processes hold pools of up to 24 connections each.

Every service runs the database migrations on boot, behind a Postgres advisory lock, so the first container applies them and the others wait. The body encryption key and the session secret are generated at deploy time; `APP_BASE_URL` and `PUBLIC_API_URL` are set to the two public domains. The API and worker reference the dashboard service's variables, so you fill in AWS credentials once.

The first account to sign up becomes the instance operator. After that, signup is closed (`ALLOW_SIGNUP=false`), because anyone with an account can create API keys that send through your SES account.

## Common Use Cases

- Transactional email (receipts, password resets, sign-in codes) from your app, at SES prices, without a per-email markup
- Leaving Resend by changing the API key and base URL, with MillionSend's migration command moving contacts, segments, templates, webhooks and domains
- Newsletters and product updates as broadcasts to contacts, targeted with segments and topics, with hosted unsubscribe pages
- One email backend for several apps or clients, each in its own team with its own domains, API keys and webhooks
- Letting AI tools and agents send email through MillionSend's MCP server

## Dependencies for MillionSend Hosting

- `ghcr.io/millionsend/millionsend:latest` (dashboard, API and worker; the latest tagged release)
- PostgreSQL 17 (`ghcr.io/railwayapp-templates/postgres-ssl:17`) on a Railway volume
- An AWS account with SES in your chosen region, and a sending domain you control

### Deployment Dependencies

- [MillionSend documentation](https://docs.millionsend.com/)
- [MillionSend self-hosting reference](https://docs.millionsend.com/self-hosting)
- [MillionSend API reference](https://docs.millionsend.com/api-reference)
- [MillionSend on GitHub](https://github.com/MillionSend/millionsend)
- [Amazon SES: request production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)

### Implementation Details

Variables on the **MillionSend** service:

```
PROCESS=web
PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_BASE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
PUBLIC_API_URL=https://${{MillionSend API.RAILWAY_PUBLIC_DOMAIN}}
MASTER_ENCRYPTION_KEY=   # generated, 32 bytes of base64
BETTER_AUTH_SECRET=      # generated
ALLOW_SIGNUP=false
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=       # from the setup wizard
AWS_SECRET_ACCESS_KEY=   # from the setup wizard
SNS_TOPIC_ARNS=          # from the setup wizard
SQS_QUEUE_URL=           # from the setup wizard
SES_CONFIGURATION_SET=   # from the setup wizard
AUTH_EMAIL_FROM=         # optional, enables password reset and email verification
```

The services boot and the dashboard works without the AWS values; sending needs them. To create the AWS side, run MillionSend's setup wizard on your own machine, where your AWS admin credentials are:

```
mkdir millionsend && cd millionsend
npx @millionsend/setup
```

It creates an IAM user limited to SES, the SNS topic, the SQS events queue and the SES configuration set, and writes them to a local `.env`. Keep the wizard's default `APP_BASE_URL` (the queue does not need a public URL), then copy `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SNS_TOPIC_ARNS`, `SQS_QUEUE_URL` and `SES_CONFIGURATION_SET` into the MillionSend service's variables. Ignore the generated secrets and database URL in that file; Railway already has its own. Then verify your domain under **Domains** in the dashboard and add the DKIM records it shows.

## Why Deploy MillionSend on Railway?

MillionSend is four long-running pieces (dashboard, API, worker, database) that Railway creates together, with generated secrets, private networking between them and a public HTTPS domain for the two that need one. The worker can get more replicas without touching the dashboard or the API (set `WORKER_REPLICAS` to the replica count so the SES rate is shared correctly), and the database stays on the private network.

## Frequently Asked Questions

### Why are there three MillionSend services instead of one?

The dashboard and the API listen on different ports and need different hostnames: their routes share paths like `/emails` and `/domains`, so they cannot share one domain. MillionSend's docs support one process per container through `PROCESS`, and that maps to one Railway service per process, each with one domain.

### The worker logs "Could not load credentials from any providers" every minute.

That is the worker reading your SES quota before AWS credentials are set. It stops once `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are filled in on the MillionSend service and the three services are redeployed.

### I can only send to my own addresses.

New SES accounts are in the sandbox, which only delivers to verified recipients, in each region separately. [Request production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html) for the region in `AWS_REGION`. The dashboard marks a sandboxed region under **Settings → SES**.

### I used the CloudFormation link in Settings → SES and the SNS subscription to my dashboard stays pending.

That page subscribes `APP_BASE_URL/ses/events` when the URL is HTTPS, but on Railway that path reaches the dashboard, while the API serves it. Nothing is lost: the same topic also delivers to the SQS queue the worker polls, which is the transport every deployment uses. You can delete the pending HTTPS subscription in the SNS console.

### How do I point my app or the Resend SDK at this instance?

Use an API key from the dashboard and the **MillionSend API** service's domain as the base URL (the dashboard prints it as `MILLIONSEND_BASE_URL`). With a Resend SDK, change the key and the base URL; the request and response shapes are the same.

### Can I use custom domains?

Yes, one on the MillionSend service and one on the API service. Then set `APP_BASE_URL` and `PUBLIC_API_URL` to them and redeploy: sign-in is only accepted from the exact `APP_BASE_URL` origin, and fails with "invalid origin" otherwise.

### What IP addresses show up in audit entries and sign-in rate limits?

MillionSend takes the client address from the right end of `X-Forwarded-For`, and Railway's edge appends its own address there. With the default `TRUSTED_PROXIES`, the address recorded is the Railway edge location that handled the request rather than the visitor's. Railway rebuilds that header itself, so it cannot be forged; it only means visitors routed through the same edge location share a sign-in rate limit.

### Do I need the SMTP relay?

Not for the API, the SDKs or the dashboard. The relay (`PROCESS=smtp`) is for software that can only speak SMTP; it is not part of the template because it refuses to start without a STARTTLS certificate, and Railway's TCP proxy would be the only way to expose it.

### How do I upgrade?

Redeploy the three MillionSend services; they pull `:latest`, the newest tagged release, and migrate on boot. Migrations only run forward, so take a database backup before a large jump. To hold a version, set the image to a version tag such as `ghcr.io/millionsend/millionsend:1.2` in each service's settings.

### Where are my email bodies, and what if I lose the key?

Bodies are gzipped and encrypted at rest with `MASTER_ENCRYPTION_KEY`, then purged after the retention window set under **Settings → Instance**. Without that key, stored bodies cannot be decrypted: copy it somewhere safe along with your database backups, and never change it on a running instance.

### What does it cost?

Measured right after deploy, idle: about 0.18 GB of RAM for the dashboard, 0.15 GB for the API, 0.16 GB for the worker and 0.18 GB for Postgres, which is roughly $7 a month at [Railway's rates](https://docs.railway.com/reference/pricing) before traffic. Sending is billed by AWS at SES rates.
