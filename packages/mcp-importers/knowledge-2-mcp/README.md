# @quickdeployai/knowledge-2-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that ingests a self-hosted document corpus — a markdown tree, or the output of [langchain-ai/openwiki](https://github.com/langchain-ai/openwiki) — and exposes it as searchable, citable tools.

See [`docs/recipes/openwiki-to-mcp.md`](../../../docs/recipes/openwiki-to-mcp.md) for the end-to-end OpenWiki walkthrough.

## Features

- **Markdown-tree ingestion**: walks a directory of `.md`/`.markdown` files, splits each into heading-bounded chunks, and reads YAML frontmatter (`title`, `tags`).
- **OpenWiki adapter**: on top of the markdown-tree adapter, collapses `index.md`/`README.md` section-landing pages into their folder so wiki structure (`Guides > Getting Started`) is preserved as citation metadata instead of an extra path segment.
- **Citable search**: every `search` hit carries a `citation` (breadcrumb + heading), not just raw text.
- **Watch mode**: `--watch` re-ingests automatically when the source tree changes (debounced `fs.watch`); a `refresh` tool covers the on-demand case.
- **Multiple storage backends**: in-memory, file-based (NDJSON), or vector (LanceDB via `corpus-core`), shared with the other corpus-backed importers.

## Quick start

```bash
pnpm install
pnpm --filter @quickdeployai/knowledge-2-mcp build

node dist/index.js --source ./openwiki --source-type openwiki --corpus-id my-repo-wiki --watch
```

## Tools

| Tool | Purpose |
|---|---|
| `search` | Full-text (+ optional RSQL filter/sort) search. Hits include `citation`, `path`, `breadcrumb`, `heading`, and a `snippet`. |
| `get_doc` | Full, untruncated chunk content + citation, by the `_id` a `search` hit returned. |
| `list_sources` | Chunk/page counts, discovered top-level sections, last refresh status. |
| `refresh` | Re-ingest `--source` on demand. |

## CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `--source <dir>` | `null` | Directory to ingest at startup |
| `--source-type <type>` | `markdown` | Ingestion adapter: `markdown` or `openwiki` |
| `--corpus-id <id>` | `--source` value | Logical id for the ingested corpus |
| `--watch` | disabled | Re-ingest automatically when `--source` changes |
| `--watch-debounce <ms>` | `500` | Debounce window for watch-triggered re-ingestion |
| `--max-items <n>` | `20000` | Max chunks retained per corpus |
| `--max-query-results <n>` | `20` | Max hits per `search` call |
| `--max-field-size <n>` | `800` | Max characters in a `search` snippet |
| `--storage <mode>` | `memory` | Storage backend: `memory`, `file`, or `vector` |
| `--storage-path <dir>` | `./knowledge-2-mcp-data` | Directory for file/vector storage |
| `--embedding <provider>` | `none` | Embedding provider: `none` or `openai` |
| `--openai-api-key <key>` | `null` | Required when `--embedding openai` |
| `--port <n>` | `3000` | Streamable HTTP port |
| `--mcp <path>` | `/mcp` | Streamable HTTP endpoint path |

## Known limitation

`corpus-core`'s `StoreAdapter` has no delete-by-path operation, so a chunk
removed or reworded upstream leaves its previous version queryable as a
stale item until the process restarts. `refresh` (and the `--watch` path)
reports `staleCandidateCount` so this is visible rather than silently masked.

## Architecture

Built on `@quickdeployai/corpus-core` (storage, schema inference, query
execution — shared with `feed-2-mcp`) and `@quickdeployai/importer-core`
(config parsing, dual stdio/streamable-HTTP transport bootstrap). Ingestion
adapters live under `src/ingestion/`; MCP-facing use cases under
`src/application/`; tool/schema wiring under `src/mcp/`.
