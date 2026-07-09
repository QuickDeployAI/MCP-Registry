# @quickdeployai/grpc-2-mcp

gRPC unary runtime proxy importer for the MCP Everywhere program.

This package implements the QUI-211 MVP, the QUI-212 auth/TLS hardening path, and the
QUI-213 server-streaming flattening:

- parse descriptor-set bytes into service and method shapes;
- expose one MCP-style tool per unary RPC;
- flatten server-streaming RPCs into a bounded tool that emits a progress callback per
  message and resolves with an aggregated, possibly-truncated result;
- keep client- and bidirectional-streaming RPCs visible as unsupported methods instead of
  dropping them silently — nothing in MCP maps to caller-initiated streams;
- map protobuf request and response messages to proto3 JSON schemas;
- use descriptor source comments for tool descriptions when a descriptor file is provided;
- call unary and server-streaming methods dynamically with `@grpc/grpc-js` and
  `@grpc/proto-loader`;
- inject env-referenced bearer, API-key, or basic credentials as gRPC metadata;
- filter unsafe caller pass-through metadata such as cookies and hop-by-hop headers;
- use insecure, TLS, custom CA, or mTLS channel credentials from file references.

The MVP accepts descriptor bytes plus a local `.proto` path for runtime calls. Descriptor
sets remain the preferred registry input because reflection often omits comments.

## Example

```ts
import { buildGrpcUnaryTools } from "@quickdeployai/grpc-2-mcp";

const runtime = {
  protoPath: "./greeter.proto",
  packageName: "quickdeploy.fixture",
  address: "127.0.0.1:50051",
  auth: {
    scheme: "bearer",
    tokenEnv: "GREETER_BEARER_TOKEN",
  },
  channelSecurity: {
    mode: "tls",
    caCertPath: process.env.GREETER_CA_CERT_PATH,
    clientCertPath: process.env.GREETER_CLIENT_CERT_PATH,
    clientKeyPath: process.env.GREETER_CLIENT_KEY_PATH,
    authority: "greeter.internal.quickdeploy.ai",
  },
  passthroughMetadata: {
    "x-request-id": "trace-123",
  },
};

const catalog = buildGrpcUnaryTools(descriptorBytes, { runtime });
const sayHello = catalog.tools.find(
  (tool) => tool.name === "quickdeploy_fixture_greeter_say_hello",
);

const response = await sayHello?.invoke({ name: "QDAI" });
```

Credentials are always read from environment variables or manifest-resolved env maps;
secrets should not be passed as CLI arguments. Missing credentials fail before the call is
made and report the missing env var name, not the secret value. Caller metadata can be
forwarded through `passthroughMetadata`, but cookie-like, authorization, and hop-by-hop keys
are blocked by default so application auth is controlled by the manifest policy.

Client- and bidirectional-streaming RPCs are returned in `unsupportedMethods` with their
descriptor comments and streaming direction so registry publishing can document the gap
explicitly.

## Server streaming

Server-streaming RPCs (request in, stream of responses out) show up in
`catalog.streamingTools` instead. Each tool's `invoke` takes an optional `onProgress`
callback plus a bound — `maxMessages` and/or `timeoutMs` — and resolves once the stream
ends or the bound is hit:

```ts
const watchHello = catalog.streamingTools.find(
  (tool) => tool.name === "quickdeploy_fixture_greeter_watch_hello",
);

const result = await watchHello?.invoke(
  { name: "QDAI" },
  {
    maxMessages: 50,
    timeoutMs: 10_000,
    onProgress: (message, index) => sendMcpProgressNotification(index, message),
  },
);

// result: { messages, count, truncated, truncationReason? }
```

`result.truncated` is `true` when the bound cut the stream short, with
`truncationReason` set to `"max-messages"` or `"timeout"` so callers can surface the cutoff
instead of returning a silently partial result. Client- and bidirectional-streaming RPCs
have no MCP-side primitive to map onto and remain in `unsupportedMethods`.
