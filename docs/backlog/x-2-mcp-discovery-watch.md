# x-2-mcp Discovery Watch

Source project: Linear "x-2-mcp Discovery Backlog & Ecosystem Watch".

This file records the current build/watch verdicts for importer categories and registry-adjacent formats that are not yet scheduled as first-class implementation projects.

## QUI-248: graphql-2-mcp

Verdict: wrap/watch. Do not build a GraphQL converter from scratch while Apollo MCP Server, mcp-graphql, WunderGraph Cosmo, and other maintained options cover the category.

Current action: seed registry references and deploy recipes for the best vendor/community options, especially Apollo MCP Server. If QuickDeploy wraps the category later, prefer curated persisted operations or operation files as per-tool units. Avoid whole-schema generated tool sets except as bounded progressive discovery.

Promotion trigger: a customer needs a manifest-uniform GraphQL surface that existing server configuration cannot express.

## QUI-249: db-2-mcp / SQL

Verdict: skip build. Database MCP is already heavily covered by vendor and community servers.

Current action: reference mature servers and borrow design patterns. The strongest pattern is curated parameterized tools, such as tools.yaml in MCP Toolbox for Databases, instead of raw SQL or schema-wide per-table tool generation.

Promotion trigger: none expected. Default work is curation, safety notes, and registry references.

## QUI-250: cli-2-mcp

Verdict: build small later. The useful shape combines `--help` introspection with a manifest-declared allowlist, argv-only execution, output caps, and a container or sandbox runtime.

Current action: keep the design note in backlog until git-2-mcp sandbox work can be reused. Treat shells, interpreters, pager flags, and credential-bearing CLIs as security-sensitive.

Promotion trigger: internal demand to expose a specific QuickDeploy CLI as MCP tooling.

## QUI-251: odata-2-mcp

Verdict: defer until enterprise or SAP demand. OData metadata is structured enough for proxy-core import, but the category is niche and partly served.

Current action: keep OData as a tool-explosion case study. The odata_mcp_go universal-tool mode is evidence that naive per-entity CRUD generation can overwhelm context and should be replaced by progressive discovery or curated selection.

Promotion trigger: a paying SAP or enterprise integration ask.

## QUI-252: terraform-provider-2-mcp

Verdict: watch. The provider-to-MCP gap is real, but infrastructure mutation has a high blast radius.

Current action: reference HashiCorp Terraform MCP Server for registry/module/policy and workspace operations. Do not describe it as provider-resource generation. If promoted, require ephemeral workspaces, plan-first execution, and explicit approval before apply.

Promotion trigger: a QuickDeploy platform-provisioning use case, possibly via Pulumi provider surfaces instead of Terraform.

## QUI-253: websocket-2-mcp

Verdict: fold into AsyncAPI. Standalone WebSocket API to MCP conversion is white space, but AsyncAPI WebSocket bindings are the right spec-driven path.

Current action: keep raw WebSocket conversion out of scope. AsyncAPI v3 WebSocket work should reuse the publish/consume semantics from asyncapi-2-mcp and only add HAR-style inference if a non-AsyncAPI described integration requires it.

Promotion trigger: asyncapi-2-mcp consume-side work completes and a real WebSocket API integration appears.

## QUI-254: opcua-2-mcp / industrial protocols

Verdict: reference/watch. OPC Foundation is the credible center of gravity, and industrial write operations need a higher safety bar than ordinary developer tools.

Current action: watch the OPC Foundation sample, document safety posture, and avoid publishing third-party write-capable servers without interlocks, dry-run support, and explicit operator approval.

Promotion trigger: an industrial or IoT customer request. A .NET implementation may be the correct exception to the TypeScript-first importer stack.

## QUI-255: jsonrpc-2-mcp / OpenRPC / EVM

Verdict: watch. EVM-specific MCP servers are hand-mapped and crowded; the generic opportunity is OpenRPC.

Current action: keep EVM out of scope because transaction signing creates key-custody risk. If a generic OpenRPC importer is promoted, map methods to tools, method schemas to validation, and `spec.select` to method allowlists.

Promotion trigger: a real OpenRPC-described service that is valuable beyond EVM.

## QUI-256: framework-native and agent-object converters

Verdict: watch. This category converts framework objects, not interface specs.

Current action: track automcp, fastapi_mcp, pydantic-rpc, and FastMCP native import/mount patterns. Documentation should steer app owners toward native mounting when they control the app, and importer workflows when they only have a spec.

Promotion trigger: marketplace demand for hosting LangGraph, CrewAI, LlamaIndex, or similar framework agents as MCP endpoints.

## QUI-257: mcpb-2-registry

Verdict: small build, registry-adjacent. MCPB is a first-class distribution format and should eventually be handled by registry tooling.

Current action: backlog two directions. Ingest `.mcpb` bundles by validating manifest metadata and file integrity, and emit MCPB bundles from baked manifest-backed servers for desktop install flows.

Promotion trigger: an external contributor ships MCPB, or the marketplace needs one-click desktop installs.

## QUI-258: mcp-2-openapi reverse bridge

Verdict: watch/wrap. This is the inverse of the importer program: expose MCP servers as REST/OpenAPI for non-MCP clients.

Current action: document the mcpo pattern and evaluate whether mcp-host should grow an optional REST facade next to streamable HTTP. Guard against confused round trips such as openapi-2-mcp over an mcp-2-openapi facade.

Promotion trigger: an integration partner cannot speak MCP but needs a registry capability.

## QUI-259: registry aggregator sources

Verdict: extend sync source by source with explicit curation policy.

Current action: evaluate Smithery, Docker MCP catalog, PulseMCP, and awesome-list style directories as sources. Rank provenance as official, vendor-hosted, aggregator, then directory. Dedupe by reverse-DNS name and endpoint, and mark source metadata in curation fields.

Promotion trigger: marketplace breadth targets that justify a new sync-handler issue per source.

## QUI-260: vendor remote-ref tranches

Verdict: catalog work. Extend the remote reference catalog beyond the first hosted seed set.

Current action: maintain the seed list in `registry/remote-ref-seeds.json`. The current tranches cover data stack, eventing/streaming, IoT/home, and dev-platform entries. Items without a stable hosted endpoint are represented as deploy recipes or watch entries instead of invented remote URLs.

Promotion trigger: a curated entry is ready to move from seed metadata into the public registry index or a deploy recipe.

## QUI-261: gRPC as an MCP transport

Verdict: pure watch. This is the reverse concern of grpc-2-mcp and should not be confused with importing gRPC services as MCP tools.

Current action: watch pluggable transport standardization, the MCP 2026-07-28 stateless-core work, and official SDK support. Keep importer-core transport abstractions pluggable.

Promotion trigger: an accepted transport specification plus official SDK support.

