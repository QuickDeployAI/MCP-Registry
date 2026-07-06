# @quickdeployai/importer-core

Shared helpers for MCP importers in this registry workspace.

## API

- `defineConfig()` merges CLI flags, environment variables, and defaults.
- `fetchTextSource()` loads text from `http(s)://`, `file://`, absolute paths, and cwd-relative paths with timeout and User-Agent support.
- `applyCredentialAuth()` resolves bearer, api-key, basic, and static OAuth2 client-credentials sources from environment variables or manifest `valueFrom.env` references, then emits HTTP headers/query params plus lower-case metadata for gRPC pass-through.
- `authEnvironmentVariables()` returns `server.json`-style secret environment variable declarations for the credentials a manifest or importer requires.
- `redactCredentialValues()` strips resolved credential values from logs and errors before they are surfaced.
- `ok()`, `toolError()`, and `jsonText()` create consistent text result envelopes.
- `parseVersion()` normalizes arbitrary version strings to MCP-compatible `x.y.z`.
- `startServer()` connects SDK-style MCP servers to a transport.

