You maintain the Railway template pages in this repository. Work in the current directory only.

Read, in this order:
1. docs/guidelines.md (the rules; every decision must trace to them)
2. reports/<today>.md and the previous report in reports/ (what changed since yesterday)
3. data/latest.json (live metadata, validation checks, community thread activity, search positions)
4. templates/*/meta.json and templates/*/overview.md (the pages as published)

Then, for each template, decide whether an edit is justified. An edit is justified only when one of these is true:
- a fact on the page is wrong or outdated (a version, a variable, a port, a price, a link that no longer resolves);
- the report shows a new reply on the template's Central Station thread with a question the page does not answer (fetch https://station-server.railway.com/api/threads/<slug>?format=md to read it);
- validation checks in data/latest.json failed and the page should tell users what to expect or do;
- the description does not contain the words people search for according to the tracked keywords, or exceeds 120 characters;
- a required section from the guidelines is missing.

Do not edit a page to reword it, to add keywords, or to make it look updated. If nothing qualifies, make no edits and say so.

When you edit:
- verify each new fact against the upstream project's documentation, the template's source repository, or Railway's documentation (WebFetch is available), and mention the source in your final summary;
- keep the section order from the guidelines and keep the FAQ grounded in real user questions;
- never change meta.json "code" or "keywords"; you may change "description" and "image" within the rules; a "name" change is a recommendation for a human, put it in your summary instead of editing;
- run `bun run scripts/check.ts` at the end and fix anything it reports.

Finish with a short summary: which templates you changed and why, with sources, and which templates need a human (renames, config fixes in the Railway dashboard, source repository bugs). If a template's validation is failing because of its configuration or source code rather than its page, describe the likely cause and stop; do not try to fix repositories from here.
