# rss-2-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that exposes RSS/Atom feeds as queryable tools for LLMs.

## Features

- **Query feed items** with RSQL-style filters, full-text search, sorting, and pagination
- **Multiple storage backends**: in-memory, file-based (NDJSON), or vector (LanceDB)
- **Token-efficient**: large fields (`contentText`, `contentHtml`) are never inlined in query responses — they're served via resource URIs
- **Polling support**: optional background polling to keep feeds fresh
- **Semantic search**: optional OpenAI embedding integration for vector similarity search
- **Clean Architecture**: layered use cases, SOLID principles, full TypeScript

## Quick Start

```bash
npm install
npm run build

# Start with a default feed
node dist/index.js --feed https://feeds.example.com/rss.xml
```

## CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `--feed <url>` | `null` | Default feed URL or file path |
| `--poll-interval <ms>` | `0` | Polling interval in ms (0 = manual only) |
| `--no-poll` | disabled | Disable automatic polling even if interval is set |
| `--max-items <n>` | `5000` | Max feed items retained per feed |
| `--max-query-results <n>` | `50` | Max items per query response |
| `--max-field-size <n>` | `500` | Max characters per field in query results |
| `--storage <mode>` | `memory` | Storage backend: `memory`, `file`, or `vector` |
| `--storage-path <dir>` | `./rss2mcp-data` | Directory for file/vector storage |
| `--embedding <provider>` | `none` | Embedding provider: `none` or `openai` |
| `--openai-api-key <key>` | env | OpenAI API key (or `OPENAI_API_KEY` env var) |

### Environment Variables

All CLI flags have environment variable equivalents:

| Env | CLI equivalent |
|-----|---------------|
| `RSS_FEED` or `FEED` | `--feed` |
| `POLL_INTERVAL` | `--poll-interval` |
| `NO_POLL=true` | `--no-poll` |
| `MAX_ITEMS` | `--max-items` |
| `MAX_QUERY_RESULTS` | `--max-query-results` |
| `MAX_FIELD_SIZE` | `--max-field-size` |
| `STORAGE_BACKEND` | `--storage` |
| `STORAGE_PATH` | `--storage-path` |
| `EMBEDDING_PROVIDER` | `--embedding` |
| `OPENAI_API_KEY` | `--openai-api-key` |

## MCP Tools

### `get_schema(feedUrl?)`

Returns the observed, feed-specific `ObservedFeedSchema` — the actual fields present in that feed's items, including namespaced extensions like `dc:creator`, `media:content`, etc.

**Always call this first** before constructing queries.

---

### `get_query_examples()`

Returns 12+ realistic example queries with descriptions. Great for learning the query syntax.

---

### `refresh_feed(feedUrl?)`

Fetches the feed from its source and ingests new items.

```json
{ "feedUrl": "https://example.com/feed.rss" }
```

Returns:
```json
{ "feedUrl": "...", "newItems": 42, "feedTitle": "Example Feed" }
```

---

### `get_feed_info(feedUrl?)`

Returns feed metadata: title, description, item count, refresh timestamps, and polling status.

---

### `query_feed_items(feedUrl?, select?, filter?, search?, orderBy?, top?, skip?)`

The main query tool. Supports:

- **`select`**: list of field names (omit for default compact set)
- **`filter`**: RSQL expression (see below)
- **`search`**: full-text search (see below)
- **`orderBy`**: sort clauses like `["publishedAt desc", "title asc"]`
- **`top`** / **`skip`**: pagination

**Large fields (`contentText`, `contentHtml`) are never returned inline.** Use `get_feed_item` to access them.

---

### `get_feed_item(feedUrl?, id, select?)`

Retrieves a single item. If you request a large field, it's returned as a `ContentRef`:

```json
{
  "type": "content-ref",
  "itemId": "abc123",
  "field": "contentText",
  "resourceUri": "rss2mcp://content/abc123/contentText",
  "size": 12345
}
```

Read the content via the `rss2mcp://content/{itemId}/{field}` MCP resource.

---

### `get_feed_stats(feedUrl?)`

Returns aggregate statistics: item count, date range, author count, category count, full-content count.

---

### `get_recent_items(feedUrl?, limit?)`

Shorthand: returns the N most recent items (default: 10).

---

### `get_new_items_since(feedUrl?, since)`

Returns items published at or after the given ISO-8601 timestamp.

```json
{ "since": "2024-06-01T00:00:00Z" }
```

## Filter Syntax (RSQL)

Filters use a simplified RSQL grammar:

```
field==value          # equals
field!=value          # not equals
field=gt=value        # greater than
field=ge=value        # greater than or equal
field=lt=value        # less than
field=le=value        # less than or equal
field=like=*pattern*  # wildcard match (* = any chars)
field=contains=value  # array contains value (for categories)

expr1;expr2           # AND
expr1,expr2           # OR
(expr1,expr2);expr3   # grouping
```

**Multi-word values must be quoted:**
```
author=="Jane Doe"
title=like=*model context*
```

**Filterable fields**: `id`, `sourceName`, `title`, `author`, `publishedAt`, `updatedAt`, `categories`, `language`, `guid`, `fetchedAt`, `hasFullContent`

## Search Syntax

```
machine learning          # plain terms (AND)
"model context protocol"  # exact phrase
OpenAI OR Anthropic       # OR
-unwanted                 # NOT (exclude term)
```

**Searchable fields**: `title`, `summary`, `contentText`

## MCP Resources

| URI | Description |
|-----|-------------|
| `rss2mcp://schema/{feedUrl}` | Observed feed-specific `ObservedFeedSchema` JSON |
| `rss2mcp://feed-info/{feedUrl}` | Live FeedInfo for a feed |
| `rss2mcp://content/{itemId}/{field}` | Full content blob (contentText or contentHtml) |

## MCP Prompts

- **`inspect-then-query`**: Guides LLM to call `get_schema` first, then query narrowly
- **`avoid-large-fields`**: Reminds LLM not to request large fields in bulk queries

## Storage Backends

### Memory (default)

Fast, zero-config. Data is lost on restart.

```bash
node dist/index.js --storage memory
```

### File

Persists items as NDJSON files. Survives restarts.

```bash
node dist/index.js --storage file --storage-path ./data
```

### Vector (LanceDB)

Persistent + optional semantic vector search.

```bash
# Without embeddings (keyword search only)
node dist/index.js --storage vector --storage-path ./data

# With OpenAI embeddings
node dist/index.js --storage vector --storage-path ./data \
  --embedding openai --openai-api-key sk-...
```

## Development

```bash
npm install
npm run dev          # run with tsx (no build needed)
npm run typecheck    # TypeScript type checking
npm test             # run vitest tests
npm run build        # compile to dist/
```

## Architecture

```
src/
├── config.ts              # CLI + env configuration
├── types.ts               # Domain types (FeedItem, FeedInfo, etc.)
├── schema.ts              # FEED_ITEM_SCHEMA + field sets
│
├── ingestion/
│   ├── fetcher.ts         # HTTP/file source fetching
│   ├── parser.ts          # rss-parser wrapper
│   └── normalizer.ts      # Canonical FeedItem normalization (uses node-html-parser)
│
├── query/
│   ├── filter.ts          # RSQL filter parser + evaluator
│   ├── search.ts          # Full-text search
│   └── executor.ts        # Query pipeline (filter → search → sort → page → project)
│
├── store/
│   ├── adapter.ts         # StoreAdapter interface
│   ├── index.ts           # MemoryStore
│   ├── file-store.ts      # FileStore (NDJSON)
│   ├── vector-store.ts    # VectorStore (LanceDB)
│   └── factory.ts         # createStore() factory
│
├── content/
│   └── content-store.ts   # ContentStore (large field offloading)
│
├── polling/
│   └── coordinator.ts     # PollingCoordinator
│
├── application/
│   ├── query-feed-items.use-case.ts
│   ├── refresh-feed.use-case.ts
│   ├── get-feed-info.use-case.ts
│   ├── get-feed-item.use-case.ts
│   ├── get-feed-stats.use-case.ts
│   ├── get-schema.use-case.ts
│   └── get-query-examples.use-case.ts
│
├── mcp/
│   ├── schemas.ts         # Zod input schemas for all tools
│   ├── tools.ts           # MCP tool registrations
│   ├── resources.ts       # MCP resource registrations
│   ├── prompts.ts         # MCP prompt registrations
│   └── server.ts          # McpServer assembly
│
└── index.ts               # Entry point
```

## License

MIT