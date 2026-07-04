#!/usr/bin/env node
/**
 * QuickDeploy Admin MCP server.
 *
 * Org and enterprise governance through the QuickDeploy Control-Plane API v1:
 * policies, approval decisions, cost budgets, and audit events. Requires
 * QDAI_API_TOKEN (service-account bearer token with policies/approvals/costs
 * scopes; see https://api.quickdeploy.ai/auth.md). QDAI_API_BASE overrides
 * the API origin for staging environments.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.QDAI_API_BASE ?? "https://api.quickdeploy.ai";

async function api(method, path, body) {
  const token = process.env.QDAI_API_TOKEN;
  if (!token) {
    throw new Error(
      "QDAI_API_TOKEN is not set. Mint a service-account token (client_credentials grant " +
        "at /v1/oauth/token; see https://api.quickdeploy.ai/auth.md) and set it in the environment.",
    );
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "quickdeploy-mcp-admin/1.0",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: HTTP ${response.status}${text ? ` — ${text}` : ""}`);
  }
  return text;
}

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

function errorResult(err) {
  return {
    content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
    isError: true,
  };
}

const server = new McpServer({ name: "quickdeploy-admin", version: "1.0.0" });

server.registerTool(
  "list_policies",
  {
    title: "List effective policies",
    description:
      "List effective policy rules and inheritance for an actor or environment (GET /v1/policies).",
    inputSchema: {},
  },
  async () => {
    try {
      return textResult(await api("GET", "/v1/policies"));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "evaluate_policy",
  {
    title: "Evaluate an action against policy",
    description:
      "Evaluate a proposed manifest, deployment, or action against current policy " +
      "(POST /v1/policies/evaluate). Run this before promising a user an action will succeed.",
    inputSchema: {
      request: z.record(z.unknown()).describe("Policy evaluation request body"),
    },
  },
  async ({ request }) => {
    try {
      return textResult(await api("POST", "/v1/policies/evaluate", request));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "list_approvals",
  {
    title: "List approval requests",
    description: "List pending, approved, denied, and expired approval requests (GET /v1/approvals).",
    inputSchema: {},
  },
  async () => {
    try {
      return textResult(await api("GET", "/v1/approvals"));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "decide_approval",
  {
    title: "Decide an approval request",
    description:
      "Approve, deny, or request changes on an approval request with audit notes " +
      "(POST /v1/approvals/:approvalId/actions/:decision). Decisions are audited — only act " +
      "on the user's explicit confirmation.",
    inputSchema: {
      approval_id: z.string().min(1),
      decision: z.enum(["approve", "deny", "request_changes"]),
      note: z.string().max(2000).optional().describe("Audit note attached to the decision"),
    },
  },
  async ({ approval_id, decision, note }) => {
    try {
      return textResult(
        await api(
          "POST",
          `/v1/approvals/${encodeURIComponent(approval_id)}/actions/${decision}`,
          note ? { note } : undefined,
        ),
      );
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "get_costs",
  {
    title: "Read costs",
    description:
      "Read real-time and forecasted costs by deployment, environment, client, or builder (GET /v1/costs).",
    inputSchema: {},
  },
  async () => {
    try {
      return textResult(await api("GET", "/v1/costs"));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "set_budget",
  {
    title: "Set a cost budget rule",
    description:
      "Set threshold, cap, and notification rules for cost governance (POST /v1/costs/budgets). " +
      "Caps with pause_on_cap stop running deployments — confirm with the user first.",
    inputSchema: {
      budget: z.record(z.unknown()).describe("Budget rule body (thresholds, caps, notifications)"),
    },
  },
  async ({ budget }) => {
    try {
      return textResult(await api("POST", "/v1/costs/budgets", budget));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "list_events",
  {
    title: "Page audit events",
    description:
      "Page durable signed event envelopes for audit, replay, and support workflows (GET /v1/events).",
    inputSchema: {},
  },
  async () => {
    try {
      return textResult(await api("GET", "/v1/events"));
    } catch (err) {
      return errorResult(err);
    }
  },
);

await server.connect(new StdioServerTransport());
