# @quickdeployai/arazzo-2-mcp

Arazzo importer utilities for turning OpenAPI Initiative Arazzo workflow
documents into QuickDeployAI workflow derived capabilities.

The package is intentionally pure and runtime-agnostic: it validates Arazzo
documents, emits one `workflow` capability per Arazzo workflow, maps steps to
the existing workflow model (`triggers`, `steps`, `required_capabilities`), and
preserves operation/source references so downstream registry and host adapters
can connect workflow steps back to API-contract ARD entries.
