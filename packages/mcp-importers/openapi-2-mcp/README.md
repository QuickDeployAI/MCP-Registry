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
  --port <number>   Port for the HTTP server (default: "3000")
  --mcp <path>      HTTP streaming endpoint path (default: "/mcp")
  --base-url <url>  Override the base URL from the spec's servers field
  -h, --help        display help for command
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
3. Creates an MCP tool for each operation with:
   - **Name**: the `operationId` (or auto-generated from method + path)
   - **Description**: the operation's `description` or `summary`
   - **Parameters**: derived from the operation's path/query parameters and request body schema
4. Starts the MCP server with the chosen transport
5. When a tool is called, makes the corresponding HTTP request to the API

## Building from Source

```bash
pnpm install
pnpm --filter @quickdeployai/openapi-2-mcp build
```

