# MCP importer suite

QuickDeployAI's MCP importer suite treats external specifications as source
artifacts and projects selected capabilities into the MCP runtime.

| Importer | Source artifact | Runtime projection | Registry example |
| --- | --- | --- | --- |
| `arazzo-2-mcp` | Arazzo 1.0.x/1.1 JSON | One executable tool per selected workflow | `registry/quickdeploy/arazzo-adoption.mcp.json` |

The Arazzo adoption example resolves a local OpenAPI source, executes a two-step
create-and-assign workflow, threads the first response into the second request,
and returns the declared workflow outputs. See the importer README for supported
runtime expressions and current limitations.
