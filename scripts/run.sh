#!/usr/bin/env bash
# Daily job: snapshot public state, write a report, let the agent revise
# template pages within docs/guidelines.md, lint, publish what changed, push.
# Touch a file named PAUSE in the repo root to skip the agent and publish steps.
set -euo pipefail

export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.."

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

git pull -q --rebase origin main || { git rebase --abort 2>/dev/null || true; log "pull failed, aborting"; exit 1; }

railway whoami >/dev/null            # refreshes the CLI token
bun run scripts/snapshot.ts
bun run scripts/report.ts

if [[ -e PAUSE ]]; then
  log "PAUSE present, skipping agent and publish"
else
  claude -p "$(cat scripts/agent-prompt.md)" \
    --permission-mode acceptEdits \
    --allowedTools "Read,Edit,Write,Glob,Grep,WebFetch,Bash(bun run scripts/check.ts),Bash(git diff*),Bash(git log*),Bash(curl -s*)" \
    --max-budget-usd 3 \
    --output-format text \
    > "reports/agent-$(date -u +%F).log" 2>&1 || log "agent exited non-zero, see reports/agent-$(date -u +%F).log"

  if bun run scripts/check.ts; then
    bun run scripts/publish.ts
  else
    log "check failed, not publishing; reverting template edits"
    git checkout -- templates
    git clean -qfd templates
  fi
fi

git add -A data reports templates
if ! git diff --cached --quiet; then
  git -c user.name='Thalles Passos' -c user.email='contato@thalles.me' \
    commit -qm "Daily run $(date -u +%F)"
  git push -q origin main
fi
log "done"
