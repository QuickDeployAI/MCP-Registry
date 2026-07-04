#!/usr/bin/env node
/**
 * QuickDeploy Control Plane MCP server.
 *
 * Manages tenant deployments through the QuickDeploy Control-Plane API v1.
 * Requires QDAI_API_TOKEN (service-account bearer token with deployments
 * scopes; see https://api.quickdeploy.ai/auth.md). QDAI_API_BASE overrides
 * the API origin for staging environments.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.QDAI_API_BASE ?? "https://api.quickdeploy.ai";

const LIFECYCLE_ACTIONS = ["pause", "resume", "promote", "rollback", "quarantine", "delete"];

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
      "User-Agent": "quickdeploy-mcp-control-plane/1.0",
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

const server = new McpServer({ name: "quickdeploy-control-plane", version: "1.0.0" });

server.registerTool(
  "create_deployment",
  {
    title: "Create a deployment",
    description:
      "Create a deployment from a manifest version, proposal, and environment target " +
      "(POST /v1/deployments). Never include raw secret values — use secret references only.",
    inputSchema: {
      deployment: z
        .record(z.unknown())
        .describe("Deployment request body (manifest version, proposal, environment target)"),
    },
  },
  async ({ deployment }) => {
    try {
      return textResult(await api("POST", "/v1/deployments", deployment));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "get_deployment",
  {
    title: "Get deployment state",
    description:
      "Read lifecycle, cost, health, and current workflow state for a deployment " +
      "(GET /v1/deployments/:deploymentId).",
    inputSchema: { deployment_id: z.string().min(1) },
  },
  async ({ deployment_id }) => {
    try {
      return textResult(await api("GET", `/v1/deployments/${encodeURIComponent(deployment_id)}`));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "deployment_action",
  {
    title: "Run a deployment lifecycle action",
    description:
      "Pause, resume, promote, rollback, quarantine, or delete a deployment " +
      "(POST /v1/deployments/:deploymentId/actions/:action). Destructive actions " +
      "(rollback, quarantine, delete) should be confirmed with the user first.",
    inputSchema: {
      deployment_id: z.string().min(1),
      action: z.enum(LIFECYCLE_ACTIONS),
    },
  },
  async ({ deployment_id, action }) => {
    try {
      return textResult(
        await api("POST", `/v1/deployments/${encodeURIComponent(deployment_id)}/actions/${action}`),
      );
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "get_deployment_logs",
  {
    title: "Read deployment logs",
    description: "Read sanitized runtime logs for a deployment (GET /v1/deployments/:deploymentId/logs).",
    inputSchema: { deployment_id: z.string().min(1) },
  },
  async ({ deployment_id }) => {
    try {
      return textResult(await api("GET", `/v1/deployments/${encodeURIComponent(deployment_id)}/logs`));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "list_environments",
  {
    title: "List target environments",
    description:
      "List available environments, regions, quotas, and policy guardrails (GET /v1/environments).",
    inputSchema: {},
  },
  async () => {
    try {
      return textResult(await api("GET", "/v1/environments"));
    } catch (err) {
      return errorResult(err);
    }
  },
);

await server.connect(new StdioServerTransport());
