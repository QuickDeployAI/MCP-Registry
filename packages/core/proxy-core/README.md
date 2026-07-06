# @quickdeployai/proxy-core

Shared stateless proxy primitives for importers that expose an upstream API as MCP tools.

The package owns:

- JSON-schema-like input conversion to Zod with `schemaToZod`
- operation naming, shared/local parameter merge, and body flattening
- request helpers for URL and body construction
- a pluggable `ProxyExecutor` interface, with an HTTP fetch executor for REST importers

Importers keep their source-format parsing locally, then map operations into `ProxyOperation`
objects. OpenAPI uses the HTTP executor today; future gRPC, SOAP, WSDL, AsyncAPI, and other
proxy importers can provide their own executors while sharing the same tool-shape contract.
