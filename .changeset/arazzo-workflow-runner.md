---
"@quickdeployai/arazzo-2-mcp": minor
---

Add a workflow runner (`runWorkflow`): executes an Arazzo workflow's steps in order, resolving each operation and building its HTTP request from `parameters`/`requestBody` (reusing `@quickdeployai/proxy-core`'s `buildUrl`/`buildBody`), evaluating `successCriteria`, and following `onSuccess`/`onFailure` flow control (`goto`, `retry`, `end`, with workflow-level `successActions`/`failureActions` as a fallback). Supports `workflowId` sub-workflow steps, output threading between steps and into workflow outputs, and `maxSteps`/`stepTimeoutMs` guards.
