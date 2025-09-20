# MCP Registry API Documentation

This document describes the REST API endpoints for the MCP Registry service.

## Base URL

```
http://localhost:8080
```

## Authentication

- **Read operations** (GET): No authentication required
- **Write operations** (POST): Currently open (authentication can be enabled via configuration)

## Endpoints

### Health Check

**GET /health**

Returns the health status of the service.

```bash
curl http://localhost:8080/health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "time": "2025-09-20T21:05:07Z"
}
```

### List Servers

**GET /v0/servers**

Returns a paginated list of all registered MCP servers.

**Query Parameters:**
- `limit` (optional): Number of results per page (default: 20, max: 100)
- `cursor` (optional): Pagination cursor for next page
- `q` (optional): Search query to filter servers by name or description

```bash
# List all servers
curl http://localhost:8080/v0/servers

# List with pagination
curl http://localhost:8080/v0/servers?limit=10

# Search servers
curl "http://localhost:8080/v0/servers?q=filesystem"
```

**Response:**
```json
{
  "servers": [
    {
      "name": "io.modelcontextprotocol/filesystem",
      "description": "Filesystem operations for MCP clients",
      "status": "active",
      "version": "1.0.2",
      "repository": {
        "url": "https://github.com/modelcontextprotocol/servers",
        "source": "github",
        "id": "modelcontextprotocol/servers"
      },
      "website_url": "https://modelcontextprotocol.io",
      "packages": [
        {
          "registry_type": "npm",
          "identifier": "@modelcontextprotocol/server-filesystem",
          "version": "1.0.2",
          "runtime_hint": "node"
        }
      ],
      "_meta": {
        "io.modelcontextprotocol.registry/official": {
          "id": "f8f5eb26-5784-4635-8a7a-dae50b99803f",
          "published_at": "2025-09-20T21:04:56.346551937Z",
          "updated_at": "2025-09-20T21:04:56.346551937Z",
          "is_latest": true
        }
      }
    }
  ],
  "metadata": {
    "count": 3,
    "next_cursor": "abc123..."
  }
}
```

### Get Server by ID

**GET /v0/servers/{id}**

Returns detailed information about a specific server.

```bash
curl http://localhost:8080/v0/servers/f8f5eb26-5784-4635-8a7a-dae50b99803f
```

**Response:**
```json
{
  "name": "io.modelcontextprotocol/filesystem",
  "description": "Filesystem operations for MCP clients",
  "status": "active",
  "version": "1.0.2",
  "repository": {
    "url": "https://github.com/modelcontextprotocol/servers",
    "source": "github",
    "id": "modelcontextprotocol/servers"
  },
  "packages": [
    {
      "registry_type": "npm",
      "identifier": "@modelcontextprotocol/server-filesystem",
      "version": "1.0.2",
      "runtime_hint": "node"
    }
  ],
  "_meta": {
    "io.modelcontextprotocol.registry/official": {
      "id": "f8f5eb26-5784-4635-8a7a-dae50b99803f",
      "published_at": "2025-09-20T21:04:56.346551937Z",
      "updated_at": "2025-09-20T21:04:56.346551937Z",
      "is_latest": true
    }
  }
}
```

### Publish Server

**POST /v0/publish**

Publishes a new MCP server to the registry or updates an existing one.

**Request Body:** JSON following the [MCP server.json schema](https://raw.githubusercontent.com/modelcontextprotocol/registry/main/docs/reference/server-json/server.schema.json)

```bash
curl -X POST http://localhost:8080/v0/publish \
  -H "Content-Type: application/json" \
  -d '{
    "name": "com.example/my-server",
    "description": "My custom MCP server",
    "version": "1.0.0",
    "status": "active",
    "packages": [
      {
        "registry_type": "npm",
        "identifier": "@example/my-mcp-server",
        "version": "1.0.0"
      }
    ]
  }'
```

**Response:** The published server with generated metadata (same format as GET response)

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error type",
  "message": "Detailed error message",
  "code": 400
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created (for publish operations)
- `400` - Bad Request (validation errors)
- `404` - Not Found
- `500` - Internal Server Error

## Server Schema

Servers must conform to the MCP server.json specification. Key fields include:

### Required Fields
- `name`: Unique server identifier (max 200 characters)
- `description`: Brief description (max 100 characters)  
- `version`: Semantic version string

### Optional Fields
- `status`: "active", "deprecated", or "deleted"
- `repository`: Source code repository information
- `website_url`: Server homepage URL
- `packages`: Array of package configurations
- `remotes`: Array of transport configurations

### Package Configuration
- `registry_type`: Package registry type ("npm", "pypi", "oci", "mcpb", "git")
- `identifier`: Package name or URL
- `version`: Package version
- `runtime_hint`: Runtime environment ("node", "python", etc.)
- `runtime_arguments`: Command line arguments
- `environment_variables`: Environment variable configurations

For complete schema details, see the [official server.json documentation](https://github.com/modelcontextprotocol/registry/tree/main/docs/reference/server-json).

## Rate Limiting

Currently no rate limiting is implemented. In production deployments, consider adding rate limiting middleware.

## CORS

The API includes CORS headers allowing cross-origin requests from any domain (`Access-Control-Allow-Origin: *`).