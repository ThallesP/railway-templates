# Guidelines for template pages

Every rule here traces to an official source or to a measurement made against Railway's public API. The daily agent reads this file before touching a template.

## How Railway builds the page from our fields

Measured on 2026-09-27 against live `railway.com/deploy/<code>` pages.

| Field we control | Where it ends up |
|---|---|
| Template name | `<title>` as `Deploy & Host {name} \| Railway`, the page H1 `Deploy {name}`, the URL slug, the marketplace card, the search index |
| Description | Appended to a fixed prefix in the meta description: `Deploy and host {name} on Railway in one click — always-on servers, built-in databases, and GitHub auto-deploys. {description}` (the prefix is about 120 characters); also on the card, the OG image and the search index |
| Overview markdown | Server-rendered on the page. Its headings are the only headings after the H1 |
| Image | Marketplace card, OG image, `image` in the SoftwareApplication JSON-LD |
| Category | Breadcrumb and the category landing page (`/deploy/category/<name>`); `Other` has no landing page |

Railway already emits canonical, Open Graph, Twitter, BreadcrumbList, HowTo and SoftwareApplication/WebApplication structured data. Nothing to add there.

Name is not in `TemplatePublishInput` (the public CLI/API surface), but the template editor renames through a change set on backboard's `/graphql/internal` endpoint: `templateChangeSetStage(templateId, patch: {metadata: {name}})` then `templateChangeSetApply(changeSetId)`. `scripts/rename.ts` does exactly that and verifies every other field is untouched. Old `slug--code` URLs keep resolving and canonicalize to the new slug. Measured 2026-09-27: renaming `n8n (w/ postgres)` to `n8n` moved it from #19 to #2 for the query `n8n` within seconds.

## Marketplace search ranking (reverse engineered)

Method: for 20 queries, fetch `templateSearch(query, first: 60)` unauthenticated, join each result with `template(code)` to get health, active and recent projects and creation date, then test candidate sort orders by Kendall tau against the observed order. Data and script: `data/ranking/`.

What the data shows:

- The index covers name, description and code. Text in the overview is not searched (probing for words that only appear in an overview returns nothing).
- Matching is by token prefix, case insensitive, AND across all query tokens, across fields (a query can match one token in the name and another in the description). Queries with a typo return nothing. Tokens do not concatenate: `click stack` does not find `ClickStack`.
- Order is lexicographic, best model at mean tau 0.82 across the 20 queries:
  1. exact name match (the whole name equals the query),
  2. name starts with the query,
  3. any name match, before description-only matches,
  4. health tier: 100, then 70 to 99, then unrated (no recent deploys), then below 70,
  5. active projects, descending.
- Health is the deploy success rate over recent deployments, the same number shown on the page. A template at 69 sorts below a brand-new one with no rating at all.
- Verified badge, recency and description length showed no independent effect once the above are accounted for.

What that means for us:

- The name is the single biggest lever. `n8n (w/ postgres)` is neither an exact nor a prefix match for `n8n`; `n8n` is. Prefer the software's exact brand name, spelled as the vendor spells it (Railway's own naming guidance), with at most a short qualifier when we have two templates for the same software.
- Health tier beats deploy count. Fix anything TemplateCI marks degraded before worrying about copy: it is both a ranking factor and what users see.
- The description is searched, so it should contain the words people type (`postgres`, `error tracking`, `sql server`), written as a sentence, not a list.

## Google Search (from Google Search Central, retrieved 2026-09-27)

- SEO Starter Guide: titles "unique to the page, clear and concise"; meta descriptions "short, unique to one particular page, and includes the most relevant points of the page"; "there's no magical word count target"; "don't copy others' content in part or in its entirety"; links need "descriptive anchor text".
- Title links: no length cap, but "unnecessarily long or verbose text" gets rewritten; "there's no reason to have the same words or phrases appear multiple times"; the site name once, at the start or end. Railway adds `| Railway` for us.
- Snippets: "Identical or similar descriptions on every page of a site aren't helpful"; keyword lists "are less likely to be displayed as a snippet". Programmatic descriptions are fine when "human-readable and diverse".
- Spam policies: keyword stuffing is "filling a web page with keywords or numbers in an attempt to manipulate rankings"; scaled content abuse covers "using generative AI tools or other similar tools to generate many pages without adding value for users"; scraped content includes light rewrites of other sites.
- Helpful content: "Are you changing the date of pages to make them seem fresh when the content has not substantially changed?" is listed as a warning sign. Date tags in titles for freshness are therefore off the table.
- Generative AI content: allowed; "focus on accuracy, quality, and relevance, especially when automatically generating the content". Disclose "when it would be reasonably expected".
- Images: alt text "the most important attribute"; "avoid filling alt attributes with keywords"; place images "near relevant text".
- Links: anchor text "descriptive, reasonably concise, and relevant"; link out to sources you trust; "every page you care about should have a link from at least one other page".

## Railway's overview structure (docs.railway.com/templates/best-practices)

H1 `Deploy and Host [X] on Railway` with a description of about 50 words, then H2 `About Hosting [X]` (about 100 words), H2 `Common Use Cases` (3 to 5 bullets), H2 `Dependencies for [X] Hosting`, H3 `Deployment Dependencies` (links), optional H3 `Implementation Details`, and `Why Deploy [X] on Railway?`. We follow that order and add an FAQ at the end built from real questions on the template's Central Station thread.

## House rules

1. Every factual claim comes from the template's serialized config, the upstream project's documentation, Railway's documentation, or a measurement we made. Cite the source in the commit message.
2. Write for the person deciding whether to click Deploy. What runs, what is preconfigured, what they must fill in, what it costs, what breaks.
3. One template, one page. No comparison sections against other vendors, no "alternative to" lists, no pricing tables for the upstream's cloud product.
4. Change a page when something is wrong, missing, outdated, or when a user asked a question the page should have answered. Do not change a page to make it look fresh.
5. Descriptions: at most 75 characters (Railway rejects longer ones), one sentence, containing the words people search for, no exclamation marks.
6. Names: the upstream brand name as the vendor spells it. No `w/`, no date tags, no version numbers unless the version is the point of the template.
7. Images: official screenshots or logos from the upstream project, with alt text that describes what is shown. Icons hosted where we control them (`assets/`).
8. Links: upstream docs, the template's source repository, and Railway docs for the platform features used. Descriptive anchor text.
