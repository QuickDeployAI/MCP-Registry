# @quickdeployai/importer-core

Shared helpers for MCP importers in this registry workspace.

## API

- `defineConfig()` merges CLI flags, environment variables, and defaults.
- `fetchTextSource()` loads text from `http(s)://`, `file://`, absolute paths, and cwd-relative paths with timeout and User-Agent support.
- `ok()`, `toolError()`, and `jsonText()` create consistent text result envelopes.
- `parseVersion()` normalizes arbitrary version strings to MCP-compatible `x.y.z`.
- `startServer()` connects SDK-style MCP servers to a transport.

