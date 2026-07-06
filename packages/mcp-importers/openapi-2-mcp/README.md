# openapi-2-mcp

Build an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server from an OpenAPI spec using the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk).

Each operation in the OpenAPI spec is exposed as an MCP tool, allowing AI agents to interact with any REST API through the MCP protocol.

## Workspace status

This package now lives in the MCP-Registry workspace at `packages/mcp-importers/openapi-2-mcp`. The former standalone repository should point here after the first workspace release ships.

## Installation

```bash
npm install -g openapi-2-mcp
```

Or run directly with `npx`:

```bash
npx openapi-2-mcp <spec>
```

## Usage

```
Usage: openapi-2-mcp [options] <spec>

Build an MCP server from an OpenAPI spec

Arguments:
  spec              Path to the OpenAPI spec file (JSON or YAML)

Options:
  --port <number>                       Port for the HTTP server (default: "3000")
  --mcp <path>                          HTTP streaming endpoint path (default: "/mcp")
  --base-url <url>                      Override the base URL from the spec's servers field
  --allow-tools <list>                  Comma-separated original operationIds to expose
  --deny-tools <list>                   Comma-separated original operationIds to hide
  --rename-tool <mapping...>            Rename operationId with old=new mappings
  --max-inline-response-bytes <number>  Return ContentRef resources for larger responses
  -h, --help                            display help for command
```

## Examples

### Start an HTTP server (Streamable HTTP + stdio)

```bash
openapi-2-mcp ./openapi.yaml
```

Starts an HTTP server on port 3000 with:
- Streamable HTTP endpoint at `http://localhost:3000/mcp`
- Stdio transport on the same process for stdio MCP clients

### Custom endpoint paths

```bash
openapi-2-mcp ./openapi.yaml --mcp /api/mcp --port 8080
```

### Stdio transport (for use with Claude Desktop, etc.)

```bash
openapi-2-mcp ./openapi.yaml
```

### Override base URL

```bash
openapi-2-mcp ./openapi.yaml --base-url https://api.example.com
```

### Curate exposed tools

```bash
openapi-2-mcp ./openapi.yaml \
  --allow-tools getPetById,findPetsByStatus \
  --deny-tools deletePet \
  --rename-tool getPetById=fetch_pet
```

Allow and deny lists use the original OpenAPI `operationId` or generated method/path slug. Renamed tools include the original operationId in the tool description so downstream clients can trace the source operation.

### Return large responses as ContentRefs

```bash
openapi-2-mcp ./openapi.yaml --max-inline-response-bytes 16384
```

Responses larger than the threshold are stored behind an MCP resource and the tool returns a JSON ContentRef like `openapi2mcp://content/getPetById/123/response`. Clients can read that resource to fetch the full upstream response without inlining it into the tool result.

## Transport Modes

### HTTP Streaming (default)

The server uses the official SDK's Streamable HTTP transport:
- **Streamable HTTP** (`--mcp` path, default `/mcp`): Modern MCP transport using HTTP streaming
- **No legacy SSE endpoint**: SSE was removed with the FastMCP dependency.

### Stdio

The process also starts the official SDK stdio transport for integrations with MCP clients that communicate over stdin/stdout, such as Claude Desktop.

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": ["openapi-2-mcp", "/path/to/openapi.yaml"]
    }
  }
}
```

## How It Works

1. Loads the OpenAPI spec (JSON or YAML)
2. Extracts all non-deprecated operations from the spec
3. Applies optional allow/deny/rename curation
4. Creates an MCP tool for each operation with:
   - **Name**: the `operationId` (or auto-generated from method + path)
   - **Description**: the operation's `description` or `summary`
   - **Parameters**: derived from the operation's path/query parameters and request body schema
5. Starts the MCP server with the chosen transport and ContentRef resource reader
6. When a tool is called, makes the corresponding HTTP request to the API

## Building from Source

```bash
pnpm install
pnpm --filter @quickdeployai/openapi-2-mcp build
```

