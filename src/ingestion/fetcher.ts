/**
 * Feed source fetcher.
 *
 * Supports:
 *   http://  / https://  – remote HTTP fetch
 *   file:///             – local file via file: URL
 *   /absolute/path       – bare filesystem path
 *   relative/path        – relative filesystem path (resolved from cwd)
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { URL, fileURLToPath } from "node:url";

/** Fetch raw XML text from any supported source. */
export async function fetchFeedSource(source: string): Promise<string> {
  const trimmed = source.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return fetchHttp(trimmed);
  }

  if (trimmed.startsWith("file://")) {
    return readFile(fileURLToPath(new URL(trimmed)), "utf-8");
  }

  // Bare filesystem path (absolute or relative)
  const abs = trimmed.startsWith("/") ? trimmed : resolve(process.cwd(), trimmed);
  return readFile(abs, "utf-8");
}

async function fetchHttp(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "rss-2-mcp/0.1 (MCP RSS reader)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
  }
  return response.text();
}
