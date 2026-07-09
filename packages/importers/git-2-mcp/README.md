# @quickdeployai/git-2-mcp

Importer for turning pinned git package surfaces into MCP tools.

## Supported fixture runtimes

- Python: `buildGit2McpManifest` inspects curated `__all__` exports and `callGit2McpTool` executes selected functions through the subprocess sandbox.
- TypeScript: `buildTypeScriptGit2McpManifest` inspects exported functions from `src/index.ts` with the TypeScript compiler API and `callTypeScriptTool` executes selected exports inside a VM context with module imports denied.

Both paths carry the same sandbox policy and supply-chain audit metadata so registry publication can require pinned git refs, pinned dependencies, hash evidence, and a passing audit.

## Python runtime MCP surface

`buildGit2McpRuntimeSurface` wraps the Python manifest into the agent-facing surface needed for the runtime host:

- curated `python_*` tools generated from the reviewed public API manifest
- `docs_search` over package README/docs plus curated API docstrings
- `run_code` for bounded long-tail Python snippets against the installed package

`run_code` executes through the same subprocess sandbox as curated tools: source stays read-only, host filesystem reads are denied, network egress is default-deny, child process creation is blocked, and wall-clock/output limits still apply. Inline responses stay small; oversized run-code output is written to a `ContentRef` through the provided content store.
