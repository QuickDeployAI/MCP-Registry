# MCP Registry Server

A hostable implementation of the Model Context Protocol (MCP) Registry specification.

## Overview

This service provides a registry for MCP servers, allowing clients to discover and retrieve information about available MCP servers. It implements the [official MCP Registry specification](https://github.com/modelcontextprotocol/registry).

## Features

- **REST API**: Standard HTTP endpoints for server discovery and publishing
- **Server Discovery**: List and search available MCP servers
- **Authentication**: Support for publishing servers with authentication
- **Data Persistence**: In-memory storage with optional database backend
- **Docker Support**: Easy deployment with Docker
- **OpenAPI Documentation**: Complete API specification

## API Endpoints

- `GET /v0/servers` - List all servers with pagination
- `GET /v0/servers/{id}` - Get server details by UUID
- `POST /v0/publish` - Publish new server (requires authentication)
- `GET /health` - Health check endpoint

## Quick Start

### Using Docker

```bash
# Build and run
docker build -t mcp-registry .
docker run -p 8080:8080 mcp-registry
```

### Local Development

```bash
# Install dependencies
go mod tidy

# Run the server
go run cmd/server/main.go

# Server will be available at http://localhost:8080
```

## Configuration

The server can be configured using environment variables:

- `PORT` - Server port (default: 8080)
- `HOST` - Server host (default: 0.0.0.0)
- `LOG_LEVEL` - Log level (default: info)

## API Usage

### List Servers

```bash
curl http://localhost:8080/v0/servers
```

### Get Server Details

```bash
curl http://localhost:8080/v0/servers/{server-id}
```

### Publish Server

```bash
curl -X POST http://localhost:8080/v0/publish \
  -H "Content-Type: application/json" \
  -d @server.json
```

## Development

### Project Structure

```
├── cmd/
│   └── server/          # Main application entry point
├── internal/
│   ├── api/            # HTTP handlers and middleware
│   ├── config/         # Configuration management
│   ├── models/         # Data models
│   ├── repository/     # Data persistence layer
│   └── service/        # Business logic
├── pkg/
│   └── types/          # Public API types
├── docs/               # Documentation
├── examples/           # Example server configurations
└── scripts/            # Build and deployment scripts
```

### Running Tests

```bash
go test ./...
```

## License

MIT License - see [LICENSE](LICENSE) file for details.