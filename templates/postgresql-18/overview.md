# Deploy and Host PostgreSQL 18 on Railway

PostgreSQL 18 is the current major release of the PostgreSQL database, with a new asynchronous I/O subsystem that speeds up sequential scans, bitmap heap scans and vacuum, OAuth authentication, a native `uuidv7()` function, B-tree skip scans and virtual generated columns. This template deploys it on Railway with SSL enabled from the first connection, a persistent volume, private networking for your other services and a public TCP proxy for external tools.

## About Hosting PostgreSQL 18

The service builds from a fork of Railway's own `postgres-ssl` repository, using its `Dockerfile.18`. That image starts from the official `postgres:18` image and adds an init script that generates a self-signed certificate on first boot and turns `ssl = on`, so clients can connect encrypted immediately. The certificate is valid for 820 days by default (`SSL_CERT_DAYS`) and is regenerated automatically on restart when it is within 30 days of expiry.

The volume is mounted at `/var/lib/postgresql`, matching the version-specific data layout the official image adopted in PostgreSQL 18, with `PGDATA` set beneath it. Railway's standard variables are all present: `DATABASE_URL` for the private network, `DATABASE_PUBLIC_URL` through the TCP proxy, and `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` for tools and the Railway data panel. The password is generated at deploy time. `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=60` gives PostgreSQL time to shut down cleanly on redeploys.

## Common Use Cases

- The primary database for a web application or API deployed in the same Railway project, connected over the private network
- Trying PostgreSQL 18 features (async I/O, `uuidv7()`, skip scans, virtual generated columns) before upgrading an existing database
- A database reachable from local tools and external services over SSL through the TCP proxy
- Analytics or reporting workloads that benefit from the faster sequential and bitmap scans

## Dependencies for PostgreSQL 18 Hosting

- `postgres:18` (official image) plus `openssl` for certificate generation, built from the template repository
- A Railway volume at `/var/lib/postgresql`
- A TCP proxy on port 5432 for external access

### Deployment Dependencies

- [PostgreSQL 18 release notes](https://www.postgresql.org/docs/release/18.0/)
- [PostgreSQL 18 documentation](https://www.postgresql.org/docs/18/)
- [Template image repository](https://github.com/ThallesP/postgres-ssl)
- [Railway volumes](https://docs.railway.com/volumes)

### Implementation Details

```
RAILWAY_DOCKERFILE_PATH=Dockerfile.18
PGDATA=/var/lib/postgresql/data/pgdata
POSTGRES_USER=postgres
POSTGRES_DB=railway
POSTGRES_PASSWORD=generated-at-deploy
SSL_CERT_DAYS=820
DATABASE_URL=postgresql://postgres:PASSWORD@postgresql-18.railway.internal:5432/railway
DATABASE_PUBLIC_URL=postgresql://postgres:PASSWORD@roundhouse.proxy.rlwy.net:PORT/railway
```

Use `DATABASE_URL` from services in the same project and `DATABASE_PUBLIC_URL` from anywhere else. Both accept `sslmode=require`; the certificate is self-signed, so tools that verify the chain need `sslmode=require` rather than `verify-full`.

## Why Deploy PostgreSQL 18 on Railway?

You get the newest PostgreSQL with SSL, backups of the volume and a public endpoint in one click, and because the service deploys from a Git repository you can eject it, own the Dockerfile and change extensions or settings while keeping Railway's volume and networking.

## Frequently Asked Questions

### How is this different from Railway's official PostgreSQL template?

The official template deploys a prebuilt image from the same upstream repository. This one builds the Dockerfile from a GitHub fork, which you can eject and modify. If you do not need to change the image, the official template is the simpler choice.

### Can I upgrade an existing PostgreSQL 16 or 17 volume to 18?

Not in place with this template. Create the new service, then `pg_dump` from the old database and `pg_restore` into the new one over the TCP proxy or from a service in the project.

### How do I connect from psql or a GUI?

Copy `DATABASE_PUBLIC_URL` from the service variables; it includes the host, port, user and password. Add `?sslmode=require` if your client does not negotiate SSL by default.

### Is the data backed up?

Railway volumes support backups from the volume's settings. Enable a schedule there, or run `pg_dump` on a cron service; a volume alone is not a backup.

### What does it cost?

PostgreSQL idles around 0.1 to 0.3 GB of RAM, plus $0.15 per GB per month for the volume, so a small database is a few dollars a month at [Railway's rates](https://docs.railway.com/reference/pricing).
