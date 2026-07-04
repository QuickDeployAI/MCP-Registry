#!/usr/bin/env node
/**
 * QuickDeploy Docs MCP server.
 *
 * Exposes the agent-optimized documentation surfaces that every public
 * QuickDeploy domain already publishes (llms.txt indexes and prebuilt
 * markdown page variants) as queryable MCP tools. Read-only; no auth.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const ALLOWED_DOMAINS = [
  "quickdeploy.ai",
  "docs.quickdeploy.ai",
  "marketplace.quickdeploy.ai",
  "portal.quickdeploy.ai",
  "status.quickdeploy.ai",
  "api.quickdeploy.ai",
];
const DEFAULT_DOMAIN = "docs.quickdeploy.ai";
const MAX_RESPONSE_BYTES = 512 * 1024;

async function fetchText(url, accept) {
  const response = await fetch(url, {
    headers: { Accept: accept, "User-Agent": "quickdeploy-mcp-docs/1.0" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: HTTP ${response.status}`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
    return text.slice(0, MAX_RESPONSE_BYTES) + "\n\n[truncated]";
  }
  return text;
}

function assertAllowedDomain(domain) {
  if (!ALLOWED_DOMAINS.includes(domain)) {
    throw new Error(`Domain must be one of: ${ALLOWED_DOMAINS.join(", ")}`);
  }
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

const server = new McpServer({ name: "quickdeploy-docs", version: "1.0.0" });

server.registerTool(
  "list_docs",
  {
    title: "List QuickDeploy docs",
    description:
      "Fetch the llms.txt documentation index for a QuickDeploy public domain. " +
      "Returns the curated page index with links.",
    inputSchema: {
      domain: z.enum(ALLOWED_DOMAINS).optional().describe(`Defaults to ${DEFAULT_DOMAIN}`),
    },
  },
  async ({ domain }) => {
    try {
      return textResult(await fetchText(`https://${domain ?? DEFAULT_DOMAIN}/llms.txt`, "text/plain"));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "search_docs",
  {
    title: "Search QuickDeploy docs index",
    description:
      "Search the llms.txt documentation index of a QuickDeploy public domain for lines " +
      "matching a keyword. Use read_doc to fetch a matching page.",
    inputSchema: {
      query: z.string().min(1).max(200),
      domain: z.enum(ALLOWED_DOMAINS).optional().describe(`Defaults to ${DEFAULT_DOMAIN}`),
    },
  },
  async ({ query, domain }) => {
    try {
      const index = await fetchText(`https://${domain ?? DEFAULT_DOMAIN}/llms.txt`, "text/plain");
      const q = query.toLowerCase();
      const matches = index.split("\n").filter((line) => line.toLowerCase().includes(q));
      return textResult(
        matches.length > 0 ? matches.join("\n") : `No index entries match "${query}".`,
      );
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "read_doc",
  {
    title: "Read a QuickDeploy doc page as markdown",
    description:
      "Fetch a QuickDeploy public page as markdown. Accepts a full URL on an official " +
      "QuickDeploy domain; uses the prebuilt .md variant (or markdown content negotiation).",
    inputSchema: {
      url: z.string().url().describe("Page URL, e.g. https://docs.quickdeploy.ai/features"),
    },
  },
  async ({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw new Error("Only https URLs are allowed");
      assertAllowedDomain(parsed.hostname);
      // Prefer the prebuilt .md variant; fall back to content negotiation.
      if (!parsed.pathname.endsWith(".md")) {
        const mdVariant = new URL(parsed.href);
        mdVariant.pathname = `${mdVariant.pathname.replace(/\/$/, "")}.md`;
        try {
          return textResult(await fetchText(mdVariant.href, "text/markdown"));
        } catch {
          // No prebuilt variant — fall through to the original URL.
        }
      }
      return textResult(await fetchText(parsed.href, "text/markdown"));
    } catch (err) {
      return errorResult(err);
    }
  },
);

await server.connect(new StdioServerTransport());
