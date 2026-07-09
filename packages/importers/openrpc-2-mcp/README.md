# @quickdeployai/openrpc-2-mcp

OpenRPC to MCP importer utilities.

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

```bash
vp run typecheck -F @quickdeployai/openrpc-2-mcp
vp run test -F @quickdeployai/openrpc-2-mcp
```
