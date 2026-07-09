# @quickdeployai/har-2-mcp

HAR capture importer for the QuickDeploy MCP importer workspace. Like
`postman-2-mcp` and `wsdl-2-mcp`, this is a **shim importer**: it converts a
foreign format into an OpenAPI 3.1 contract and then delegates request/tool
construction to `@quickdeployai/openapi-2-mcp`. It never talks to a real server
on its own.

## Why this is two steps, not one

A HAR file is a raw browser/proxy network capture. Naively turning it into a
running MCP server in one shot is unsafe for two reasons the ticket calls out
explicitly:

1. **HAR captures are noisy.** Alongside the API calls you actually want,
   they're full of analytics beacons (Google Analytics, segment.io, ...) and
   static assets (`.css`, `.js`, images). One-shotting these into "tools" would
   expose garbage endpoints.
2. **Captured requests carry real secrets.** `Authorization` headers, session
   cookies, and `api_key` query parameters in a HAR file are _live, previously
   used credentials_ — not placeholders like `${API_TOKEN}`. Copying them
   verbatim into an OpenAPI spec would leak them into a file that gets shared,
   committed, or handed to a proxy engine.
3. **Schemas are inferred from single examples.** A HAR capture usually has one
   example request/response per endpoint, so the inferred JSON Schema is a
   guess that a human should sanity-check before it's trusted.

So `har-2-mcp` never goes straight from `.har` to a running server. It is a
three-command, two-_decision_-point pipeline:

```
convert  ──►  draft spec (unreviewed) + redaction report
                    │
                    ▼  (human reviews the redaction report)
review --accept  ──►  reviewed spec
                    │
                    ▼
serve  ──►  openapi-2-mcp engine builds real MCP tools
```

A draft spec's `x-quickdeploy-har-review.status` is always `"draft"` when it
comes out of `convert`. `buildHarMcpTools` (the function `serve` calls) checks
that flag and throws `HarNotReviewedError` for anything that isn't
`"reviewed"` — there is no code path from a draft straight to a runnable tool.

## Step 1: convert

```ts
import { convertHarToOpenApi, loadHarArchive } from "@quickdeployai/har-2-mcp";

const har = await loadHarArchive({
  harPath: "packages/importers/har-2-mcp/fixtures/petstore.har",
});

const { openapi, redactionReport, warnings } = convertHarToOpenApi({
  har,
  title: "Petstore HAR",
});
```

or via the CLI:

```sh
har-2-mcp convert --har capture.har --out draft.json --redaction-report report.json
```

`convertHarToOpenApi`:

- drops noise entries (known analytics/tracker hosts, static asset
  extensions, `OPTIONS` preflights) before building any operations;
- collapses numeric/UUID path segments into named path parameters
  (`/pet/1` and `/pet/2` both become `/pet/{petId}`, grouping repeated calls
  into one operation instead of one per captured URL);
- infers request/response JSON Schemas from captured bodies, and adds a
  `single-example-schema` warning per operation when a schema came from only
  one example;
- scans every captured header, query parameter, and cookie for
  auth-shaped names (`authorization`, `api_key`, `session_id`, `token`, ...)
  or auth-shaped values (`Bearer ...`, JWT-looking strings);
- **never embeds a flagged value in the draft spec.** Flagged fields are
  replaced with an OpenAPI security requirement that points at an environment
  variable name (e.g. `HAR_HEADER_AUTHORIZATION`); the raw captured secret only
  ever appears in nowhere — not even the redaction report, which stores a
  masked `sample` (e.g. `sk_l***...`).

The redaction report is a plain list of findings — what was flagged, where
(`header` / `query` / `cookie`), and why — for a human to check before
anything is servable.

## Step 2: review --accept

```ts
import { reviewHarDraft } from "@quickdeployai/har-2-mcp";

const reviewed = reviewHarDraft({ draft: openapi, redactionReport, accept: true });
```

or via the CLI:

```sh
har-2-mcp review --draft draft.json --redaction-report report.json --out reviewed.json --accept
```

`reviewHarDraft` refuses to produce a reviewed spec unless:

- the input is actually a draft (`status === "draft"`);
- `accept` is explicitly `true` — omitting `--accept` is a no-op that leaves
  you with an error, not a silently-approved spec;
- the supplied redaction report's finding count matches the one recorded on
  the draft, so you can't accept a stale or unrelated report.

## Step 3: serve

```ts
import { buildHarMcpTools } from "@quickdeployai/har-2-mcp";

const tools = buildHarMcpTools({
  spec: reviewed,
  baseUrl: "https://petstore3.swagger.io",
  env: process.env, // must supply HAR_HEADER_AUTHORIZATION, etc., out-of-band
});
```

or via the CLI:

```sh
har-2-mcp serve --spec reviewed.json --base-url https://petstore3.swagger.io
```

`buildHarMcpTools` is the only place this package talks to the OpenAPI engine.
It checks `spec["x-quickdeploy-har-review"].status === "reviewed"` — an
unreviewed draft throws `HarNotReviewedError` here, refusing to serve — then
delegates to `@quickdeployai/openapi-2-mcp`'s `buildOpenApiTools`, resolving
each redaction-derived security scheme from a real environment variable
(never the value captured in the HAR file).

## Fixture

`fixtures/petstore.har` is a small synthetic capture used by the test suite:
two real Petstore calls (`GET /pet/{id}`, `POST /pet`), one call carrying a
fake bearer token / `api_key` query param / session cookie (to exercise
redaction), a Google Analytics beacon, and a `.css` asset request (both
noise, dropped during conversion). All secret-shaped values in the fixture
are clearly-fake placeholders, not real credentials.
