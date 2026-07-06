/**
 * MCP resource registrations.
 *
 * Exposes:
 *   rss2mcp://schema/{feedUrl}     – observed feed schema (feed-specific)
 *   rss2mcp://feed-info/{feedUrl}  – live FeedInfo
 *   rss2mcp://content/{itemId}/{field} – large-field content blobs
 */
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StoreAdapter } from "../store/adapter.js";
import type { ContentStore } from "../content/content-store.js";

export function registerResources(
  server: McpServer,
  store: StoreAdapter,
  contentStore: ContentStore,
): void {
  server.resource(
    "rss2mcp-schema",
    new ResourceTemplate("rss2mcp://schema/{feedUrl}", { list: undefined }),
    { description: "Observed feed schema describing all fields present in the feed's items." },
    async (uri, { feedUrl }) => {
      const url = Array.isArray(feedUrl) ? feedUrl[0] : feedUrl;
      const schema = await store.getObservedSchema(decodeURIComponent(url));
      const text = schema
        ? JSON.stringify(schema, null, 2)
        : JSON.stringify({
            error: "Schema not available",
            suggestion: "Call refresh_feed first to load and inspect the feed.",
          });
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text }],
      };
    },
  );

  server.resource(
    "rss2mcp-feed-info",
    new ResourceTemplate("rss2mcp://feed-info/{feedUrl}", { list: undefined }),
    { description: "Live FeedInfo metadata for a registered feed." },
    async (uri, { feedUrl }) => {
      const url = Array.isArray(feedUrl) ? feedUrl[0] : feedUrl;
      const info = await store.getFeedInfo(decodeURIComponent(url));
      const text = info
        ? JSON.stringify(info, null, 2)
        : JSON.stringify({ error: "Feed not found" });
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text }],
      };
    },
  );

  server.resource(
    "rss2mcp-content",
    new ResourceTemplate("rss2mcp://content/{itemId}/{field}", { list: undefined }),
    { description: "Full content blob for a large field (contentText or contentHtml)." },
    async (uri, { itemId, field }) => {
      const id = Array.isArray(itemId) ? itemId[0] : itemId;
      const f = Array.isArray(field) ? field[0] : field;
      const content = await contentStore.retrieve(id, f);
      const mimeType = f === "contentHtml" ? "text/html" : "text/plain";
      return {
        contents: [
          {
            uri: uri.href,
            mimeType,
            text: content ?? "",
          },
        ],
      };
    },
  );
}
