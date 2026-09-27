# Deploy and Host Dispatcher on Railway

Dispatcher is a self-hosted dashboard for people who publish Railway templates. It signs in with your Railway account, snapshots your template earnings and deployment counts on a schedule, charts payouts, projects and active deploys over time, notifies you when a template's health drops or a payout is requested, and can withdraw your kickback balance to your payout account every day. Railway's own metrics page shows aggregates; Dispatcher keeps the history.

## About Hosting Dispatcher

Dispatcher is one Go binary with the React frontend and a DuckDB database embedded, so the template is a single service with a volume at `/data` for the database file. Login is Railway OAuth: on first start Dispatcher registers an OAuth client, and `CALLBACK_URL` is set to `https://<your public domain>/api/auth/callback` so the redirect lands back on your instance. There is no separate user database; Railway remains the only authority on who you are, and losing access to the workspace ends the session.

The health check on `/api/health` keeps traffic off a deploy until it is ready. Background collection, auto-withdraw and notifications assume a single process, so keep the service at one replica.

## Common Use Cases

- Tracking template kickback earnings over time with period-over-period comparisons
- Watching total, recent and active projects per template to see which ones grow
- Getting a Discord, Slack, ntfy or webhook message when a template's health drops or a payout is requested
- Automatic daily withdrawal of the kickback balance to a payout account
- Querying your numbers from scripts and agents with the `dispatcherctl` CLI

## Dependencies for Dispatcher Hosting

- The Dispatcher repository (Go API, React Router frontend, DuckDB), built with the included Dockerfile
- A Railway volume at `/data` for `dispatcher.duckdb`
- A public domain, which the OAuth callback URL is derived from

### Deployment Dependencies

- [Dispatcher source and README](https://github.com/ThallesP/dispatcher)
- [Railway template metrics](https://docs.railway.com/templates/metrics)

### Implementation Details

```
DB_PATH=/data/dispatcher.duckdb
CALLBACK_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}/api/auth/callback
```

The session cookie carries the Railway OAuth grant sealed with the OAuth client secret, is HttpOnly and Secure, and renews itself while Railway honours the refresh token. Notification targets use editable Go text templates and can be tested before they are enabled.

Install the CLI on Linux or macOS with:

```
curl -fsSL https://raw.githubusercontent.com/ThallesP/dispatcher/main/install.sh | sh
dispatcherctl login
dispatcherctl summary
```

## Why Deploy Dispatcher on Railway?

The data is about Railway, the login is Railway, and the instance costs a few dollars a month next to the templates it watches. Deploying it into the same workspace means one place to see what your templates earn and whether they are healthy, without exporting anything.

## Frequently Asked Questions

### Which Railway account should I log in with?

The one that owns the workspace where your templates are published. Dispatcher reads that workspace's template metrics and payout balance.

### Is auto-withdraw on by default?

No. Enable it in the settings once you have a payout account configured on Railway. It withdraws the available balance once a day.

### Can I run more than one replica?

No. Collection, withdrawals and notifications would run twice.

### What does it cost to run?

A single small service: typically well under 0.3 GB of RAM and a volume that grows slowly with snapshots. It fits comfortably inside the Hobby plan's included usage.

### Where is the data stored?

In a DuckDB file on the service's volume at `/data`. Delete the volume and the history is gone; the numbers themselves still exist on Railway.
