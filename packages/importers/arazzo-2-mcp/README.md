# @quickdeployai/arazzo-2-mcp

Arazzo 1.0.x/1.1 workflow importer and runtime projection for QuickDeployAI.
It turns OpenAPI Initiative Arazzo documents into workflow capabilities and one
executable MCP tool per selected workflow.

```bash
npx @quickdeployai/arazzo-2-mcp serve \
  --spec ./workflow.arazzo.json \
  --source petstore=https://api.example.com \
  --port 3000
```

The standalone server exposes tools over stdio and streamable HTTP at `/mcp`;
`/ping` is its readiness endpoint. Repeat `--source name=url` to override
source-description base URLs.

The package is intentionally pure and runtime-agnostic: it validates Arazzo
documents, emits one `workflow` capability per Arazzo workflow, maps steps to
the existing workflow model (`triggers`, `steps`, `required_capabilities`), and
preserves operation/source references so downstream registry and host adapters
can connect workflow steps back to API-contract source entries.

## Runtime coverage

- local files, `file:` URLs, and HTTP(S) Arazzo JSON documents;
- OpenAPI and nested Arazzo `sourceDescriptions`;
- `operationId`, `operationPath`, and sub-workflow steps;
- `$inputs`, `$steps`, `$response`, `$sourceDescriptions`, JSON Pointer, and
  template runtime expressions;
- success criteria plus `goto`, `retry`, and `end` flow control;
- workflow/step outputs, `maxSteps`, `stepTimeoutMs`, source URL overrides, and
  workflow allowlisting.

The importer does not yet support YAML Arazzo documents, callback/webhook
execution, non-HTTP source types, every OpenAPI serialization style, or arbitrary
JSONPath beyond the documented runtime-expression subset. Invalid or unresolved
sources fail closed with an importer error.

```ts
import { buildArazzoTools, loadArazzoDocument } from "@quickdeployai/arazzo-2-mcp";
import { resolveArazzoSources } from "@quickdeployai/arazzo-2-mcp/sources";

const document = await loadArazzoDocument("fixtures/adoption-workflow.arazzo.json");
const sources = await resolveArazzoSources(document, {
  baseUrl: "fixtures/adoption-workflow.arazzo.json",
});
const tools = buildArazzoTools(document, {
  sources,
  executor: async (request) => {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    });
    return { status: response.status, text: await response.text() };
  },
});
```

```bash
pnpm --filter @quickdeployai/arazzo-2-mcp start --help
pnpm --filter @quickdeployai/arazzo-2-mcp start inspect fixtures/adoption-workflow.arazzo.json
pnpm --filter @quickdeployai/arazzo-2-mcp test
```
