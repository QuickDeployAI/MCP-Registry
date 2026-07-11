# @quickdeployai/openrpc-2-mcp

OpenRPC to MCP importer utilities and standalone MCP server.

```bash
npx @quickdeployai/openrpc-2-mcp serve \
  --spec ./petstore.openrpc.json \
  --endpoint https://rpc.example.com \
  --port 3000
```

The server exposes MCP simultaneously over stdio and streamable HTTP at
`http://localhost:3000/mcp`; `/ping` is the readiness endpoint. Use
`--transport ws` for a WebSocket JSON-RPC upstream and `--mcp-path` to change
the HTTP path.

This package owns the OpenRPC document model and JSON-RPC runtime projection. It
loads OpenRPC JSON from inline objects/strings, local files, `file:` URLs, and
HTTP(S) URLs, validates the document with `@open-rpc/schema-utils-js`, resolves
local `$ref` values, and returns a normalized `OpenRpcModel`.

```ts
import { loadOpenRpcDocument, parseOpenRpcDocument } from "@quickdeployai/openrpc-2-mcp";

const fromFile = await loadOpenRpcDocument("fixtures/petstore.openrpc.json");
const fromInline = parseOpenRpcDocument({
  openrpc: "1.3.2",
  info: { title: "Example", version: "1.0.0" },
  methods: [
    {
      name: "ping",
      params: [],
    },
  ],
});

console.log(fromFile.methods.map((method) => method.name));
console.log(fromInline.openrpc);
```

The model preserves:

- top-level and method-level servers;
- method names, summaries, descriptions, errors, and `paramStructure`;
- resolved parameter and result schemas.

`openRpcToParsedCapabilities()` emits one `api-contract` capability for the
document and one `tool` capability per method. `buildOpenRpcTools()` exposes
those methods as executable JSON-RPC tools. By-position methods are still
presented as named MCP inputs, then serialized in content-descriptor order when
the JSON-RPC request is sent.

```ts
import { buildOpenRpcTools, parseOpenRpcDocument } from "@quickdeployai/openrpc-2-mcp";

const model = parseOpenRpcDocument(openRpcJson);
const tools = buildOpenRpcTools(model, {
  endpoint: "https://rpc.example.test",
  transport: "http",
});
```

## Compatibility

- OpenRPC `1.2.x` and `1.3.x` JSON documents are validated with the official
  OpenRPC schema utilities. YAML is not supported.
- JSON-RPC runs over HTTP(S) or WebSocket (`transport: "http" | "ws"`).
- Both `by-name` and `by-position` parameter structures are supported.
- Local `$ref` values are resolved. Remote references are not fetched.

## Projection configuration

When `mcp-host` runs an OpenRPC ARD entry, runtime settings come from its
`McpProjectionConfig`:

| Setting | Purpose |
| --- | --- |
| `select.methods` | Original JSON-RPC method names to expose. |
| `expose.tools[].from` | Original method name used for rename/deny rules. |
| `config.defaults.endpoint` | JSON-RPC HTTP(S) or WebSocket endpoint. Falls back to the first OpenRPC `servers[]` URL. |
| `config.defaults.transport` | `http` or `ws`; inferred from a `ws:`/`wss:` endpoint when omitted. |
| `config.defaults.headers` | Non-secret static upstream headers. |
| `config.defaults.requestTimeoutMs` | Per-call timeout. |
| `auth` | Bearer, API-key, basic, or pre-resolved OAuth2 token sourced from environment variables. |

The committed registry example is
[`registry/quickdeploy/openrpc-petstore.ard.json`](../../../registry/quickdeploy/openrpc-petstore.ard.json)
with its adjacent projection. OAuth2 client-credential token exchange is not
implemented by the JSON-RPC client and fails closed; use an environment-sourced
access token instead.

## Current limitations

- Remote `$ref` resolution and OpenRPC Link/Callback execution are not supported.
- Subscription/notification methods are represented as ordinary request tools;
  long-lived streaming semantics are not projected.
- The example endpoint is a fixture placeholder. Supply a reachable upstream
  with user config before invoking it.

```bash
vp run typecheck -F @quickdeployai/openrpc-2-mcp
vp run test -F @quickdeployai/openrpc-2-mcp
```
