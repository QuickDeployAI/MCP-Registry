/**
 * MCP prompt registrations.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer): void {
  server.prompt(
    "inspect-then-query",
    "Guides the LLM to call get_schema first to understand available fields, then construct a narrow query.",
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Before querying, always call get_schema() to see the available fields and their capabilities.",
              "Then call query_feed_items() with a precise select list to return only the fields you need.",
              "Avoid requesting large fields (contentText, contentHtml) in bulk queries — use get_feed_item() for individual items.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.prompt(
    "avoid-large-fields",
    "Reminds the LLM that contentText and contentHtml are large fields that should only be fetched for individual items via get_feed_item, not in bulk queries.",
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "IMPORTANT: contentText and contentHtml are large fields.",
              "Never include them in query_feed_items() — they will be excluded automatically.",
              "To read the full content of a specific item, use get_feed_item(id=..., select=[\"contentText\"]) or get_feed_item(id=..., select=[\"contentHtml\"]).",
              "These return a ContentRef object with a resourceUri you can read via the rss2mcp://content resource.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
