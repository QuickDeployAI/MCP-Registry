# Recipe: OpenWiki output → queryable MCP

[langchain-ai/openwiki](https://github.com/langchain-ai/openwiki) is a CLI that
**writes and maintains** a markdown documentation tree for a repository — it
is not itself an MCP server or a RAG system. This recipe covers the other
half: turning the `openwiki/` tree it produces into a searchable, citable MCP
server using `@quickdeployai/knowledge-2-mcp`.

```
repo → openwiki (writes markdown tree) → knowledge-2-mcp (serves it over MCP)
```

## 1. Generate the wiki

Run OpenWiki against the target repository per its own docs (typically via
its GitHub Action or CLI). This produces a committed `openwiki/` directory,
one markdown file per page, with folders forming the wiki's section
hierarchy — usually one `index.md` (or `README.md`) per folder acting as that
section's landing page.

```
openwiki/
  index.md                          # wiki home
  guides/
    index.md                        # "Guides" section landing page
    getting-started/
      index.md                      # "Guides > Getting Started"
      troubleshooting.md            # "Guides > Getting Started > Troubleshooting"
```

## 2. Run knowledge-2-mcp against it

```bash
npx @quickdeployai/knowledge-2-mcp \
  --source ./openwiki \
  --source-type openwiki \
  --corpus-id my-repo-wiki \
  --watch
```

- `--source-type openwiki` picks the OpenWiki-aware ingestion adapter
  (`src/ingestion/openwiki.ts`): it chunks every page by heading (via the
  generic markdown-tree adapter) and rewrites each chunk's wiki path so that
  `index.md`/`README.md` landing pages collapse into their folder — the page
  "guides/getting-started/index.md" is addressed as **Guides > Getting
  Started**, not **Guides > Getting Started > Index**.
- `--watch` starts an `fs.watch` on the source directory (debounced) and
  re-ingests automatically whenever OpenWiki rewrites the tree — this is the
  "re-index on wiki-update" path. Content-hash dedup in `corpus-core` means
  unchanged chunks are true no-ops on every re-ingest.
- Without `--watch`, call the `refresh` tool after a wiki update instead.

**Known limitation, not silently hidden:** the shared `corpus-core`
`StoreAdapter` has no delete-by-path operation. A chunk that is *removed* or
*reworded* upstream leaves its previous version queryable as a stale item
until the process restarts — `refresh`'s response includes
`staleCandidateCount` so operators can see this and decide whether to bounce
the server after a large edit instead of trusting incremental refresh alone.

## 3. Query it

The server exposes four tools:

| Tool | Purpose |
|---|---|
| `search` | Full-text + optional RSQL filter/sort over all ingested chunks. Every hit carries a `citation` (breadcrumb + heading) and a `snippet`. |
| `get_doc` | Full, untruncated chunk content + citation, by the `_id` a `search` hit returned. |
| `list_sources` | Corpus summary: chunk/page counts, discovered top-level sections, last refresh status. |
| `refresh` | Re-ingest `--source` on demand (also called automatically by `--watch`). |

Example `search` call and response:

```jsonc
// call
{ "name": "search", "arguments": { "search": "authentication" } }

// result (excerpt)
{
  "hits": [{
    "id": "f9b92a0d...",
    "citation": "Guides > Getting Started > Troubleshooting > Authentication errors",
    "path": "guides/getting-started/troubleshooting.md",
    "breadcrumb": "Guides > Getting Started > Troubleshooting",
    "heading": "Authentication errors",
    "snippet": "A 401 response means `SAMPLE_LIB_TOKEN` is missing or expired."
  }]
}
```

`get_doc` with that `id` returns the full chunk body plus the same citation,
so an agent can cite exactly which wiki page and section an answer came
from.

## Example manifest

A worked example lives at
[`packages/importers/knowledge-2-mcp/examples/openwiki.manifest.yaml`](../../packages/importers/knowledge-2-mcp/examples/openwiki.manifest.yaml).

> **Status note:** the MCP Manifest v1 format and its `mcp-host` runtime
> (tracked under the "MCP Manifest Spec & Runtime Host" project) do not yet
> exist as buildable code in this monorepo, despite Linear tracking issues
> for them. The manifest below documents the *intended* shape once that
> runtime lands; today, the CLI invocation in step 2 is the real, tested way
> to run this importer.

## Fixture used by the automated tests

`examples/fixtures/openwiki-sample/` is a tiny 4-page OpenWiki-shaped tree
used by `src/__tests__/application/openwiki-recipe.e2e.test.ts`, which
ingests it, searches it, and asserts the resulting citation matches the
expected breadcrumb — the executable version of this recipe's acceptance
criteria.
