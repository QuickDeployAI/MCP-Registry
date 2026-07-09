# Remote MCP Catalog Seed

This seed keeps hosted MCP endpoints as remotes-only `server.json` documents under
`registry/<provider>/`. Entries are intentionally conservative:

- use official provider-hosted endpoints only;
- record runtime OAuth separately from static header requirements;
- mark each curation record with a category, `isOfficial`, and searchable tags;
- keep watch items and non-hosted local servers out of `servers.json`.

Author new entries from `docs/registry/templates/remote.server.json`; the full
authoring and review checklist lives in
`docs/registry/remote-ref-authoring.md`.

## Seeded endpoints

| Provider                    | Endpoint                                       | Auth note                            |
| --------------------------- | ---------------------------------------------- | ------------------------------------ |
| Atlassian Rovo              | `https://mcp.atlassian.com/v1/mcp/authv2`      | Runtime OAuth                        |
| Cloudflare API              | `https://mcp.cloudflare.com/mcp`               | Runtime OAuth or bearer token        |
| Cloudflare AI Gateway       | `https://ai-gateway.mcp.cloudflare.com/mcp`    | Runtime OAuth or bearer token        |
| Cloudflare Browser Run      | `https://browser.mcp.cloudflare.com/mcp`       | Runtime OAuth or bearer token        |
| Cloudflare Docs             | `https://docs.mcp.cloudflare.com/mcp`          | Runtime OAuth or bearer token        |
| Cloudflare Observability    | `https://observability.mcp.cloudflare.com/mcp` | Runtime OAuth or bearer token        |
| Cloudflare Workers Bindings | `https://bindings.mcp.cloudflare.com/mcp`      | Runtime OAuth or bearer token        |
| Cloudflare Workers Builds   | `https://builds.mcp.cloudflare.com/mcp`        | Runtime OAuth or bearer token        |
| Confluent managed MCP       | `https://api.confluent.cloud/mcp/v1`           | HTTP Basic API key credentials       |
| Context7                    | `https://mcp.context7.com/mcp`                 | Optional `CONTEXT7_API_KEY` header   |
| dbt Platform                | `https://<dbt-host>/api/ai/v1/mcp`             | Runtime OAuth, PAT, or service token |
| GitHub Copilot              | `https://api.githubcopilot.com/mcp/`           | Runtime client authorization         |
| Home Assistant              | `https://<home-assistant-host>/api/mcp`        | Runtime OAuth or bearer token        |
| HubSpot CRM                 | `https://mcp.hubspot.com`                      | Runtime OAuth                        |
| Linear                      | `https://mcp.linear.app/mcp`                   | Runtime authorization                |
| LlamaIndex LlamaParse       | `https://mcp.llamaindex.ai/mcp`                | Runtime OAuth                        |
| Neon                        | `https://mcp.neon.tech/mcp`                    | Runtime OAuth                        |
| Notion                      | `https://mcp.notion.com/mcp`                   | Runtime OAuth                        |
| Postman                     | `https://mcp.postman.com/mcp`                  | Runtime OAuth or bearer token        |
| Sentry                      | `https://mcp.sentry.dev/mcp`                   | Runtime OAuth                        |
| Slack                       | `https://mcp.slack.com/mcp`                    | Runtime OAuth                        |
| Supabase                    | `https://mcp.supabase.com/mcp`                 | Runtime OAuth or bearer token        |
| Vercel                      | `https://mcp.vercel.com`                       | Runtime OAuth                        |

## Tranche notes

- Data stack: Supabase has a stable hosted MCP endpoint and dbt exposes
  account-scoped MCP endpoint URLs. Keep MotherDuck, genai-toolbox, and MindsDB
  as package/deploy-recipe candidates until there is a stable hosted endpoint
  and auth model that does not embed tenant data.
- Eventing/streaming: Confluent has managed read-only MCP endpoints for
  organization-wide and regional Confluent Cloud inspection. Keep the
  open-source `@confluentinc/mcp-confluent` server as the deploy recipe for
  write operations, Confluent Platform, and self-managed Kafka.
- IoT/home: reference the official Home Assistant MCP integration over
  third-party servers. The endpoint is instance-scoped and must be provided by
  the user's Home Assistant URL or gateway.
- Dev platform: Postman has stable hosted US and EU MCP endpoints. Terraform's
  MCP server is deployable locally or remotely, but has no universal hosted
  endpoint, so keep it as a deploy recipe rather than a remotes-only entry.

## Skip-list guidance

The following ecosystem items are intentionally not catalog entries in this seed:

- GraphQL: route to Apollo MCP Server or Cloudflare GraphQL MCP when the source is
  provider-hosted; do not invent a generic `graphql-2-mcp` remote.
- Databases: prefer official provider remotes such as Neon and Supabase; track
  genai-toolbox, dbhub, MotherDuck, and MindsDB as connector/importer candidates
  until each has a stable hosted endpoint and auth story.
- Terraform: keep as a deploy recipe until HashiCorp publishes a universal
  hosted MCP endpoint. Registry entries should point at a user-owned deployment
  or package when promoted.
- CLI wrappers: keep `cli-2-mcp` out of the remote seed. Promote only through
  [`cli-2-mcp-promotion-policy.md`](../architecture/cli-2-mcp-promotion-policy.md)
  when a concrete CLI needs manifest-selected argv tools and sandbox evidence.
