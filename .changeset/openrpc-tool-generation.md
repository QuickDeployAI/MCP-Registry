---
"@quickdeployai/openrpc-2-mcp": minor
---

Add `expose` (allow/deny/rename) tool filtering, `auth` credential wiring (bearer/apiKey/basic/oauth2ClientCredentials headers resolved eagerly from the environment — throws before any request if a required secret is missing), and a `bin.mts` CLI (`catalog` and `call` subcommands) to `buildOpenRpcTools`.
