# Deploy and Host Interval on Railway

Interval is a way to build internal tools from backend code alone: you write actions with the Node or Python SDK, and Interval Server renders the forms, tables and approval flows for your team, no frontend to build. Interval was acquired by Meter in 2023 and its server was released as open source under the MIT license. This template runs that server on Railway with PostgreSQL and a MinIO service for file uploads.

## About Hosting Interval

Interval Server is a Node.js application that needs a PostgreSQL database. The template builds it from a repository that adds a Dockerfile to the upstream server, serves it on a public domain with a health check on `/health-check/`, and generates the three secrets the server requires: `SECRET` for password encryption, `WSS_API_SECRET` for communication between Interval's own services, and `AUTH_COOKIE_SECRET` for session cookies. `APP_URL` is set to the public domain and `DATABASE_URL` references the **Interval Postgres** service over the private network.

Email is optional and goes through Postmark: leave `POSTMARK_API_KEY` empty and Interval simply does not send invitations or notifications. The **Interval Uploads Storage** service is a MinIO instance on a volume; connect it to Interval by setting the `S3_*` variables described in the README when you start using file inputs.

## Common Use Cases

- Admin tools: refunds, account lookups, feature flag toggles, written as functions in the backend that already has the data
- Approval workflows and scheduled scripts that non-engineers can run from a UI
- Data entry and moderation dashboards that would otherwise need a React app
- Keeping internal tooling on your infrastructure now that the hosted Interval service is gone

## Dependencies for Interval Hosting

- Interval Server (Node.js 18) from the template repository
- PostgreSQL 16 (`ghcr.io/railwayapp-templates/postgres-ssl:16`) on a Railway volume
- MinIO on a Railway volume for uploads (optional to wire up)

### Deployment Dependencies

- [Interval Server documentation](https://interval.com/docs)
- [Interval Server on GitHub](https://github.com/interval/server)
- [Template repository](https://github.com/ThallesP/interval-server-on-railway)

### Implementation Details

```
APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
DATABASE_URL=${{Interval Postgres.DATABASE_URL}}
SECRET=${{secret()}}
WSS_API_SECRET=${{secret()}}
AUTH_COOKIE_SECRET=${{secret(32)}}
POSTMARK_API_KEY=            # optional
EMAIL_FROM=                  # optional, for example: Interval Bot bot@example.com
```

In your application, install `@interval/sdk` (or the Python package), point it at your instance with the endpoint option, and use the API key you create in the Interval dashboard.

## Why Deploy Interval on Railway?

Interval is three moving parts (server, database, object storage) that Railway creates together with generated secrets and private networking. Because the SDK runs inside your own backend, the only thing you host is this server, and it is small.

## Frequently Asked Questions

### Is Interval still maintained?

The hosted product was shut down after the Meter acquisition; the open source server and SDKs are on GitHub and still receive commits. This template tracks the server repository.

### How do I connect my app?

Create an API key in the Interval dashboard, then initialize the SDK with that key and your server's URL as the endpoint. Actions your code registers appear in the dashboard for your team.

### Do I need Postmark?

Only for emails. Everything else works without it; invitation and notification emails are simply not sent.

### How do I enable file uploads?

Set `S3_KEY_ID`, `S3_KEY_SECRET`, `S3_BUCKET`, `S3_REGION` and `S3_ENDPOINT` on the Interval service to the MinIO service's credentials (its root user and password are in its variables), create the bucket in MinIO, and configure CORS as described in the README.

### What does it cost?

Interval Server idles around 0.2 to 0.3 GB of RAM; with PostgreSQL and MinIO the whole stack is about $5 to $7 a month at [Railway's rates](https://docs.railway.com/reference/pricing) for a handful of users.
