# MCP importer suite

QuickDeployAI's MCP importer suite treats external specifications as source
artifacts and projects selected capabilities into the MCP runtime.

| Importer | Source artifact | Runtime projection | Registry example |
| --- | --- | --- | --- |
| `openrpc-2-mcp` | OpenRPC 1.2.x/1.3.x JSON | One executable JSON-RPC tool per selected method | `registry/quickdeploy/openrpc-petstore.ard.json` |
| `arazzo-2-mcp` | Arazzo 1.0.x/1.1 JSON | One executable tool per selected workflow | `registry/quickdeploy/arazzo-adoption.ard.json` |

The Arazzo adoption example resolves a local OpenAPI source, executes a two-step
create-and-assign workflow, threads the first response into the second request,
and returns the declared workflow outputs. See the importer README for supported
runtime expressions and current limitations.

The OpenRPC Petstore example selects `pets.get`, renames it to `get_pet`, and
routes calls through the ARD-aware `mcp-host`. The importer supports HTTP and
WebSocket JSON-RPC transports plus by-name and by-position parameters. See the
[`openrpc-2-mcp` README](../packages/importers/openrpc-2-mcp/README.md) for
configuration, authentication, and unsupported OpenRPC features.
