/**
 * Feed source fetcher.
 */
import { fetchTextSource } from "@quickdeployai/importer-core";

/** Fetch raw XML text from any supported source. */
export async function fetchFeedSource(source: string): Promise<string> {
  return fetchTextSource(source, {
    userAgent: "feed-2-mcp/0.1 (MCP RSS reader)",
  });
}
