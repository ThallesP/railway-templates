# railway-templates

Source of truth for the Railway templates published under Thalles Passos's workspace, plus a daily job that measures how they do and keeps their pages accurate.

- `templates/<name>/meta.json`: code, name, description, category, icon URL and the marketplace search keywords we track
- `templates/<name>/overview.md`: the page shown on `railway.com/deploy/<code>`
- `assets/`: icons served through jsDelivr (`https://cdn.jsdelivr.net/gh/ThallesP/railway-templates@main/assets/<file>`)
- `docs/guidelines.md`: what Railway does with each field, how marketplace search ranks (measured), and the Google Search Central rules we follow
- `data/ranking/`: the search results and the script used to fit the ranking model
- `data/latest.json`, `data/history/`: daily snapshots of live metadata, validation, icon health, thread activity and search positions
- `reports/`: daily reports and the agent's log

## Scripts

```
bun run scripts/snapshot.ts            # read-only, unauthenticated
bun run scripts/report.ts              # reports/<date>.md from the last two snapshots
bun run scripts/check.ts               # lint metadata and overviews, resolve every link
bun run scripts/publish.ts --dry-run   # show what differs from Railway
bun run scripts/publish.ts             # railway templates update ... for templates that differ
scripts/run.sh                         # the daily job
```

Publishing uses the Railway CLI's stored login. Template names cannot be changed through the CLI or API; the scripts report a mismatch and a person renames the template at railway.com/workspace/templates.

## Daily job

A systemd user timer runs `scripts/run.sh` every morning. It snapshots, reports, lets Claude Code revise pages under `docs/guidelines.md` with a hard budget, lints, publishes only what changed, and commits. Create a file named `PAUSE` in the repository root to keep the snapshot and report but skip the agent and publishing.

```
systemctl --user status railway-templates.timer
journalctl --user -u railway-templates.service -n 100
```
