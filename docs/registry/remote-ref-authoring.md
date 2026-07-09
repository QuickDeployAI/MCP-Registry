# Remote-Ref Authoring Guide

Remote refs describe externally hosted MCP servers without copying provider
source or packaging a local runtime. Add them as remotes-only `server.json`
documents under `registry/<provider>/`, then let `@quickdeployai/registry-cli`
publish them into the canonical `servers.json` catalog.

Start from `docs/registry/templates/remote.server.json`. Templates live outside
`registry/` so they are never included in generated registry artifacts.

## When to Use Remote Refs

Use a remote ref when all of these are true:

- the endpoint is provider-hosted or provider-documented;
- the entry can be represented with an official `remotes[]` block;
- no source checkout, build step, package install, or OCI image is needed;
- auth can be described as runtime OAuth or placeholder static headers;
- QuickDeploy curation can live under reverse-DNS `_meta` keys.

Do not use a remote ref for community wrappers, account-specific private URLs,
SDK-only integrations, or local stdio servers. Put those through an importer or
the discovery backlog until there is a stable hosted endpoint and publish policy.

## Namespace Rules

Use the provider's real reverse-DNS namespace in `name`.

- `com.linear/mcp` for a Linear-owned endpoint.
- `com.cloudflare/api-mcp` for a Cloudflare-owned endpoint.
- `ai.quickdeploy/<name>` only for QuickDeploy-owned servers.

The registry entry name is not a display title. Keep provider ownership visible
and avoid generic names such as `mcp`, `remote`, or `api-tools`.

## Remote Shape

Each entry should have one or more `remotes[]` items:

```json
{
  "type": "streamable-http",
  "url": "https://mcp.example.com/{tenant_id}/mcp",
  "variables": {
    "tenant_id": {
      "description": "Provider tenant slug or account id.",
      "required": true
    }
  }
}
```

Use `streamable-http` unless the provider explicitly documents another MCP
transport. URL template variables belong in `variables`; do not bake tenant ids,
workspace ids, regions, or organization slugs into a published catalog entry.

## Auth and Headers

Prefer runtime OAuth when the hosted MCP server advertises OAuth/OIDC resource
metadata. In that case, leave static `headers` out of the remote and document
the behavior in `_meta["ai.quickdeploy.registry/auth"]`:

```json
{
  "type": "runtime-oauth",
  "notes": "Supported clients discover and complete authorization at connect time."
}
```

Use static headers only when the provider documents API-token auth for MCP
clients. Header values must be placeholders, never secrets:

```json
{
  "headers": [
    {
      "name": "Authorization",
      "value": "Bearer ${EXAMPLE_MCP_API_TOKEN}",
      "isSecret": true
    }
  ]
}
```

Use environment-style placeholders (`${NAME}`) or client input placeholders, not
real values. Keep secret semantics on the header object when supported, and add a
matching auth note under `_meta`.

## Curation and Review

Every remote ref needs QuickDeploy curation:

```json
{
  "ai.quickdeploy.registry/curation": {
    "verifiedStatus": "review",
    "category": "productivity",
    "isOfficial": true,
    "tags": ["linear", "remote"]
  }
}
```

Set `isOfficial` to `true` only for provider-owned endpoints. Use
`verifiedStatus: "review"` until liveness, auth, ToS, and stability are checked.
Keep additional review evidence under a reverse-DNS `_meta` key such as
`ai.quickdeploy.registry/review`; never add QuickDeploy curation fields at the
top level of the official server document.

## Validation

Before publishing a remote ref:

1. Copy `docs/registry/templates/remote.server.json` to
   `registry/<provider>/<surface>.server.json`.
2. Replace the namespace, endpoint, auth note, variables, category, and tags.
3. Run `vp run test -F @quickdeployai/registry-cli -- remote-seed.test.ts`.
4. Run `vp run @quickdeployai/registry-cli#check:generated`.
5. Run the normal affected gate before opening a PR.

The template itself is validated by the remote seed test. Because it lives under
`docs/registry/templates/`, it remains available to authors without appearing in
`servers.json`.
