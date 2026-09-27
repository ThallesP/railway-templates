# Deploy and Host Comentario on Railway

Comentario is an open source comment engine you embed in any web page with one script tag: nested comments with Markdown, voting, moderation, live updates, and login with email, social providers, OpenID Connect or SSO. It adds no tracking scripts, pixels or ads, which is the point of running your own instead of Disqus. This template deploys Comentario with PostgreSQL, and Comentario's own README lists it as the way to run Comentario on Railway.

## About Hosting Comentario

Comentario is a single Go binary with a built-in frontend. The **Comentario** service builds from a small repository that wraps the official image and renders the database secrets file at build time from the PostgreSQL connection variables; it serves the admin UI and the embed script on a public domain with a health check on `/en/`. **Postgres** is Railway's SSL-enabled PostgreSQL 17 on a volume, reached over the private network. `BASE_URL` is set to the service's public domain so links in emails and the embed script resolve correctly.

After deploying, open the domain, create the first user (the superuser), add your website as a domain in the admin UI, and paste the embed snippet into your pages.

## Common Use Cases

- Comments on a personal blog or documentation site without handing readers' data to a third party
- Discussion on static sites (Hugo, Astro, Jekyll, Next.js exports) that have no backend of their own
- Moderated comments with spam filtering through Akismet or Perspective extensions
- Several sites managed from one admin UI, each with its own moderators and rules

## Dependencies for Comentario Hosting

- `registry.gitlab.com/comentario/comentario` (Go server with embedded frontend), built through the template repository
- PostgreSQL 17 (`ghcr.io/railwayapp-templates/postgres-ssl:17`) on a Railway volume

### Deployment Dependencies

- [Comentario documentation](https://docs.comentario.app/)
- [Comentario configuration reference](https://docs.comentario.app/en/configuration/)
- [Comentario on GitLab](https://gitlab.com/comentario/comentario)
- [Template repository](https://github.com/ThallesP/comentario-on-railway)

### Implementation Details

```
PORT=80
BASE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
POSTGRES_HOST=${{Postgres.PGHOST}}
POSTGRES_PORT=${{Postgres.PGPORT}}
POSTGRES_DATABASE=${{Postgres.POSTGRES_DB}}
POSTGRES_USERNAME=${{Postgres.POSTGRES_USER}}
POSTGRES_PASSWORD=${{Postgres.POSTGRES_PASSWORD}}
```

The `POSTGRES_*` values are passed as build arguments and written to Comentario's `secrets.yaml`, which `SECRETS_FILE` points at. Email (SMTP), social login keys and other secrets are added the same way or as `COMENTARIO_*` environment variables; the configuration reference lists every option.

## Why Deploy Comentario on Railway?

A comment server is a long-running service with a database, which is two Railway services, private networking and a generated password. Deploying from a Git repository also means the service follows updates to the template, and a custom domain for the embed script is a setting rather than a reverse proxy.

## Frequently Asked Questions

### How do I add comments to my site?

In the Comentario admin UI, add your site under Domains. It shows a snippet like `<script src="https://<your comentario domain>/comentario.js"></script>` plus a `<comentario-comments>` tag; put both where the comments should render.

### Can readers comment without an account?

Yes, if you enable anonymous or unregistered commenting for the domain. Moderation rules can send those comments to a queue first.

### Where do email notifications come from?

Configure an SMTP server in Comentario's secrets or `COMENTARIO_SMTP_*` variables. Without it, notifications and email verification are off but commenting still works.

### How do I migrate from Disqus or WordPress?

Comentario imports Disqus, WordPress and Commento exports from the admin UI under the domain's import section.

### What does it cost?

Comentario idles well under 0.1 GB of RAM and PostgreSQL adds a little more; a personal site runs inside the Hobby plan's included $5 of usage.
