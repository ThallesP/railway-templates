# Deploy and Host ClickStack on Railway

ClickStack is ClickHouse's open source observability stack: ClickHouse stores the telemetry, an OpenTelemetry collector ingests it, and HyperDX is the interface for searching and charting logs, traces, metrics and session replays together. This template deploys all four services (ClickHouse, the collector, HyperDX and its MongoDB) with the connections, health checks and volumes already configured.

![HyperDX search view over logs and traces with a histogram of events](https://raw.githubusercontent.com/hyperdxio/hyperdx/main/.github/images/search_splash.png)

## About Hosting ClickStack

**ClickHouse** (`clickhouse/clickhouse-server:24`) keeps the data on a volume at `/var/lib/clickhouse`, with a generated password, a `railway` database, and both private and public connection URLs exposed as variables. **HyperDX** (`hyperdx/hyperdx:2`) serves the UI on a public domain with a health check on `/api/health`; it is preconfigured with the ClickHouse connection and the default log, trace, metric and session sources, so the first screen after signup already knows where the data is. **OTEL Collector** (`hyperdx/hyperdx-otel-collector:2`) exposes OTLP over HTTP on its own public domain and pulls its pipeline configuration from HyperDX over OpAMP on the private network. **MongoDB** (`mongo:7`) stores HyperDX's dashboards, alerts and users on a second volume.

On first visit, HyperDX asks you to create the first user, which becomes the team owner. The ingestion API key is in Team Settings; the collector only accepts data that carries it.

## Common Use Cases

- Centralized logs and traces for a set of Railway services, sent over the private network with no egress cost
- Application performance monitoring from HTTP requests down to database queries, correlated with logs
- Session replay for a web app next to the backend traces of the same request
- A self-hosted alternative to per-GB observability SaaS, with retention decided by your volume size

## Dependencies for ClickStack Hosting

- ClickHouse server 24 on a Railway volume
- HyperDX 2 (UI and API) and its OpenTelemetry collector
- MongoDB 7 on a Railway volume

### Deployment Dependencies

- [ClickStack documentation](https://clickhouse.com/docs/use-cases/observability/clickstack)
- [ClickStack getting started](https://clickhouse.com/docs/use-cases/observability/clickstack/getting-started)
- [Sending data with OpenTelemetry](https://clickhouse.com/docs/use-cases/observability/clickstack/ingesting-data/opentelemetry)
- [HyperDX on GitHub](https://github.com/hyperdxio/hyperdx)

### Implementation Details

Endpoints after deploy:

- HyperDX UI: the HyperDX service's public domain
- OTLP/HTTP from outside Railway: the OTEL Collector's public domain over HTTPS (it listens on 4318)
- OTLP from services in the same project: the collector's private domain, `${{OTEL Collector.RAILWAY_PRIVATE_DOMAIN}}`, port 4318 for HTTP or 4317 for gRPC
- ClickHouse HTTP API: port 8123 on the private network, or the ClickHouse service's public domain

Every OTLP request needs an `authorization` header with the ingestion API key from HyperDX's Team Settings.

## Why Deploy ClickStack on Railway?

Four services with two volumes, private networking, health checks and generated secrets is exactly the kind of stack that is tedious to assemble by hand. On Railway it is one deploy, each service scales on its own, and the telemetry from the rest of your project can reach the collector without leaving the private network.

## Frequently Asked Questions

### I sent data but nothing shows up.

Check three things: you created the first user (the collector cannot fetch its pipeline before a team exists), the `authorization` header carries the ingestion API key from Team Settings, and you are sending to the collector's domain, not HyperDX's.

### How much does it cost?

ClickHouse is the service that grows. Memory for the four services adds up to roughly 1.5 to 2 GB at rest, about $15 to $20 a month at Railway's $10 per GB rate, plus $0.15 per GB per month for the ClickHouse volume as data accumulates. Set a retention policy in ClickHouse (TTL on the `otel_*` tables) to keep the volume bounded.

### Can I point HyperDX at an existing ClickHouse?

Yes. Change the `DEFAULT_CONNECTIONS` variable on the HyperDX service, or add the connection in the UI, and remove the bundled ClickHouse service.

### How do I upgrade?

The images are pinned to major versions (`clickhouse-server:24`, `hyperdx:2`, collector `2`, `mongo:7`), so a redeploy picks up minor updates. Bump the tags in the service settings for a major upgrade after reading the release notes.

### Which SDKs work?

Any OpenTelemetry SDK. HyperDX also ships its own browser and Node SDKs for session replay; the ClickStack docs list them per language.
