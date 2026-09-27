# Deploy and Host Probo on Railway

Probo is an open source governance, risk and compliance platform for engineering and security teams: risk register, control library, policies with sign-off, vendor reviews, access reviews, audit programs and a public compliance page, covering SOC 2, ISO 27001, HIPAA and GDPR. It is MIT licensed and built to be self-hosted. This template deploys Probo with PostgreSQL, a storage bucket and the headless Chrome it uses to render PDFs and vendor assessments.

![Probo console overview](https://raw.githubusercontent.com/getprobo/probo/main/.github/cover_v3.png)

## About Hosting Probo

The **Probo** service runs the official `ghcr.io/getprobo/probo` image on a public domain with a volume at `/data`. **Postgres** is Railway's SSL-enabled PostgreSQL 17 on its own volume, reached over the private network. **Chrome** runs `chromedp/headless-shell`, which Probo drives for PDF export and website risk assessments. File storage (evidence, attachments, documents) goes to a Railway bucket, whose endpoint and credentials are referenced into the `AWS_*` variables. The cookie secret, password pepper, encryption key and trust-token secret are generated at deploy time.

SMTP is optional. Without it Probo runs but does not send invitations or notifications; fill in `SMTP_ADDR`, `SMTP_USER`, `SMTP_PASSWORD` and `MAILER_SENDER_EMAIL` when you want email.

## Common Use Cases

- Preparing for a SOC 2 or ISO 27001 audit with controls, evidence and policies in one place, on your own infrastructure
- Vendor risk management with automated website assessments and DPA/BAA tracking
- Access reviews across SaaS, cloud and source control, with campaign tracking
- A public trust page listing certifications and policies for customers
- Letting an MCP-compatible agent read and draft compliance work, since Probo exposes its entities as MCP tools

## Dependencies for Probo Hosting

- `ghcr.io/getprobo/probo` on a Railway volume
- PostgreSQL 17 (`ghcr.io/railwayapp-templates/postgres-ssl:17`) on a Railway volume
- `chromedp/headless-shell` for rendering
- A Railway storage bucket (S3 compatible) for files

### Deployment Dependencies

- [Probo website](https://www.getprobo.com/)
- [Probo documentation](https://docs.getprobo.com/)
- [Probo environment variables](https://www.probo.com/docs/deployment/configuration/environment-variables)
- [Probo on GitHub](https://github.com/getprobo/probo)

### Implementation Details

```
PROBOD_BASE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
API_CORS_ALLOWED_ORIGINS=https://probo.example.com   # your Probo domain
PG_ADDR=${{Postgres.PGHOST}}:${{Postgres.PGPORT}}
CHROME_DP_ADDR=${{Chrome.RAILWAY_PRIVATE_DOMAIN}}:9229
AWS_BUCKET=${{Bucket.BUCKET}}
AWS_ENDPOINT=${{Bucket.ENDPOINT}}
```

Recent Probo releases want the CORS origin with its scheme and require an RSA private key in `PROBOD_OAUTH2_SERVER_SIGNING_KEY` for the OAuth 2.0 server; see the FAQ.

## Why Deploy Probo on Railway?

Compliance data is the kind you want on your own infrastructure, and Probo needs four pieces (app, database, browser, object storage) that Railway provisions together with private networking and generated secrets. The bucket removes the usual step of creating an S3 bucket and IAM user elsewhere.

## Frequently Asked Questions

### Login or API calls fail with a CORS error.

Newer Probo versions require the full origin. Set `API_CORS_ALLOWED_ORIGINS` to `https://` followed by your Probo domain (the template's default omits the scheme) and redeploy.

### The logs mention a missing OAuth signing key.

Recent releases require an RSA private key for the OAuth 2.0 server: `PROBOD_OAUTH2_SERVER_SIGNING_KEY` in the Probo docs (the template's other variables use the unprefixed form, and both are accepted). Generate one locally with `openssl genrsa 2048`, add it as a variable on the Probo service, and redeploy.

### Custom domain verification for SAML says it cannot find the TXT record.

Probo verifies the record by DNS lookup from inside the container. Make sure the TXT record is on the exact hostname Probo shows, wait for propagation, and retry. A user reported forcing verification directly in the database as a last resort; treat that as a workaround, not the fix.

### Do I need SMTP?

No. Everything works without email except invitations, notifications and password reset emails.

### How much does it cost?

Four services: Probo and Chrome are the memory users (budget around 1 GB together), PostgreSQL is small at rest, and bucket storage is billed per GB. Expect roughly $10 to $15 a month for a small team at [Railway's rates](https://docs.railway.com/reference/pricing).
