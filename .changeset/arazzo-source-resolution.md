---
"@quickdeployai/arazzo-2-mcp": minor
---

Add Arazzo source resolution: fetch each `sourceDescription` (OpenAPI, or nested Arazzo resolved recursively) and index operations by `operationId` and by JSON-Pointer `operationPath`, so workflow steps can be resolved back to a concrete OpenAPI operation.
