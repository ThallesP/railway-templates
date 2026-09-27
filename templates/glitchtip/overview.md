# Deploy and Host GlitchTip on Railway

GlitchTip is open source error tracking that speaks the Sentry protocol: point any Sentry SDK at its DSN and you get grouped issues, stack traces, releases, performance data and uptime checks, without per-event pricing. This template deploys GlitchTip with PostgreSQL and Redis, generates the secret key, sets the domain, and closes public signup after the first account is created.

![GlitchTip issues page listing grouped errors with counts and last seen times](https://glitchtip.com/assets/home/issues-page@2x.webp)

## About Hosting GlitchTip

GlitchTip is a Django application. It needs PostgreSQL 14 or newer for issues, events and users, and it can use Redis (or Valkey) for caching and its task queue. The template provides both on Railway volumes and connects them over the private network.

The **glitchtip-web** service runs the official `glitchtip/glitchtip` image, applies database migrations on start, serves the dashboard and the event ingestion endpoints on a public domain, and has a health check on `/login` so traffic only reaches a deploy that is up. `SECRET_KEY` is generated at deploy time, `GLITCHTIP_DOMAIN` is set to the service's public URL so DSNs and email links are correct, and `ENABLE_USER_REGISTRATION=false` means the first person to open the site registers and every later signup is refused. Email is optional: leave `EMAIL_URL` empty and GlitchTip skips email verification; fill it with an SMTP URL later to get alert emails.

Recent GlitchTip releases run the task worker inside the web process, so the template is those three services and nothing else.

## Common Use Cases

- Error tracking for web and mobile apps using the Sentry SDKs you already have, by changing only the DSN
- One instance for all your side projects and client work, with unlimited projects and events for the price of the compute
- Uptime monitoring and performance traces alongside errors, in one place
- Keeping error payloads, which often contain user data, on infrastructure you control

## Dependencies for GlitchTip Hosting

- `glitchtip/glitchtip` (web application, migrations on start)
- PostgreSQL 15 on a Railway volume
- Redis (`bitnami/redis`) on a Railway volume, password protected

### Deployment Dependencies

- [GlitchTip installation and configuration docs](https://glitchtip.com/documentation/install/)
- [GlitchTip documentation home](https://glitchtip.com/documentation/)
- [GlitchTip on GitLab](https://gitlab.com/glitchtip)

### Implementation Details

Variables on the web service:

```
DATABASE_URL=${{Postgres.DATABASE_PRIVATE_URL}}
REDIS_URL=${{Redis.REDIS_PRIVATE_URL}}
SECRET_KEY=${{secret()}}
GLITCHTIP_DOMAIN=https://${{RAILWAY_PUBLIC_DOMAIN}}
ENABLE_USER_REGISTRATION=false
EMAIL_URL=                      # optional, e.g. smtp://user:pass@host:587
DEFAULT_FROM_EMAIL=             # optional
```

After the first login, create an organization, then a team, then a project. GlitchTip shows the project's DSN, which is the only value your application needs.

## Why Deploy GlitchTip on Railway?

The three services, their volumes and their private connections are created together, and you can scale the web service's memory independently of the database. The image is tagged `latest`, so a redeploy upgrades GlitchTip; GlitchTip's own docs recommend pinning to a major version tag such as `glitchtip/glitchtip:6` in production, which you can do in the service settings.

## Frequently Asked Questions

### I deployed this earlier and have a crashed glitchtip-worker service. Is something broken?

No. GlitchTip 6 runs the worker inside the web process and removed the standalone worker script, so that service has nothing to run. Delete the `glitchtip-worker` service from your project; the web service handles the task queue on its own. New deploys of the template no longer include it.

### Where do I find the DSN?

In GlitchTip, open the project and its settings. The DSN uses `GLITCHTIP_DOMAIN`, which is why that variable is set to your public URL. If you add a custom domain, update the variable and redeploy.

### Do I need to configure email?

Not to use it. Without `EMAIL_URL`, GlitchTip skips email verification and you can register and start receiving events immediately. Set it when you want alert emails and invitations.

### How do I let a teammate sign up?

Either invite them from the organization members page, or temporarily set `ENABLE_USER_REGISTRATION=true`, let them register, and set it back.

### How much does it cost?

A small GlitchTip instance is mostly memory: budget roughly 0.5 to 1 GB for the web service plus the two databases, which at Railway's $10 per GB per month comes to around $10 to $15 a month for a lightly loaded instance, with no per-event charges. See [Railway pricing](https://docs.railway.com/reference/pricing) for the rates.

### How do I upgrade?

Redeploy the web service. Check the GlitchTip blog before a major version change, since majors can drop support for older PostgreSQL versions.
