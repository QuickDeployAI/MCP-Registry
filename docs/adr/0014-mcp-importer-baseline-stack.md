# ADR 0014: MCP importer baseline stack

## Status

Accepted - 2026-07-06

## Context

The MCP Everywhere importer program is turning the MCP registry work into a
shared x-2-mcp ecosystem rather than a set of one-off servers. The current
importers do not start from the same stack:

- `feed-2-mcp` uses the official `@modelcontextprotocol/sdk`, zod 3, yargs, and
  stdio only.
- `openapi-2-mcp` uses `fastmcp`, zod 4, commander, and multiple transports.
- `packages/mcp-importers/agent-skills-2-mcp` already proves that this monorepo
  can expose Agent Skills through the official SDK using prompts, tools,
  resources, and stdio.

Without a baseline, core extraction work would either freeze the mismatches into
`importer-core`, `proxy-core`, and `corpus-core`, or force every importer port to
make architecture decisions again.

## Decision

1. **MCP runtime SDK:** use the official `@modelcontextprotocol/sdk` for all
   TypeScript importers and shared runtime packages. Do not introduce `fastmcp`
   into new importer-core, proxy-core, corpus-core, manifest, or host packages.
2. **Schema validation:** standardize on **zod 4** for generated and hand-written
   schemas. Existing zod 3 usage is migrated as part of importer porting rather
   than supported in shared core.
3. **CLI surface:** standardize on **commander** for CLIs. Shared config parsing
   keeps importer defaults, environment overrides, and explicit CLI flags as
   separate inputs so ports can preserve behavior while replacing yargs.
4. **Transport baseline:** every importer that can run as a standalone MCP server
   supports **stdio** and **streamable HTTP** through shared transport bootstrap
   code. Legacy SSE is allowed only behind a documented consumer exception and
   must not become the default path for new packages.
5. **Runtime and test floor:** Node 22 is the minimum runtime. Vitest is the
   package test runner. ESLint flat config and strict TypeScript settings from
   the stricter importer template are the target for migrated packages.
6. **Language policy:** TypeScript is the default implementation language for
   registry packages, importers, CLIs, and hosts. A non-TypeScript implementation
   is allowed only when the runtime boundary requires it, and the owning issue or
   ADR must document:
   - why TypeScript is not the right execution boundary;
   - the sandbox or process boundary between that code and the registry host;
   - the package-level test and publish gates that keep it compatible with the
     TypeScript registry.
7. **Exception process:** stack exceptions are reviewed as ADR notes or explicit
   issue acceptance criteria before implementation starts. Exceptions are narrow,
   named, and time-bounded; downstream packages cannot copy an exception by
   precedent alone.

## Porting issues

The two existing importer ports are tracked by Linear and inherit this decision:

- `QUI-173` ports `feed-2-mcp` to zod 4, commander, and streamable HTTP while
  keeping the official SDK and existing tool/resource/prompt behavior.
- `QUI-174` ports `openapi-2-mcp` from `fastmcp` to the official SDK while
  preserving its parser and stdio plus streamable HTTP behavior.

Both remain blocked on their repository migration issues plus this ADR, so core
extraction work can treat the baseline as settled once `QUI-166` is done.

## Consequences

- `importer-core` owns transport bootstrap, result envelopes, config loading, and
  common MCP server startup around the official SDK.
- `proxy-core` and `corpus-core` can expose zod 4 schemas without compatibility
  shims for zod 3.
- New importer templates use commander, Vitest, ESLint flat config, and strict
  TypeScript from the start.
- `fastmcp`, yargs, zod 3, or legacy SSE can still exist temporarily inside
  pre-port packages, but they are migration debt rather than accepted defaults.
- Git-backed or sandbox-heavy importers can use another language internally only
  through a documented boundary; the registry and host contract stay TypeScript
  first.

## Non-goals

- Migrating either importer in this ADR.
- Designing the full MCP manifest schema or `mcp-host` runtime.
- Defining the security sandbox for `git-2-mcp`; that project still needs its
  own security review gate.

## References

- `packages/mcp-importers/agent-skills-2-mcp`
- Linear `QUI-166`
- Linear `QUI-173`
- Linear `QUI-174`
- Linear `QUI-237`
