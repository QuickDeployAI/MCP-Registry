/**
 * OpenWiki-output adapter.
 *
 * langchain-ai/openwiki is a CLI that writes/maintains a committed
 * `openwiki/` markdown tree (it is NOT itself an MCP server or RAG system).
 * This adapter ingests that tree with the generic markdown-tree adapter,
 * then rewrites `wikiPath`/`breadcrumb` to reflect OpenWiki's page/section
 * convention: a folder's landing page (`index.md` or `README.md`)
 * represents the folder itself rather than an extra path segment.
 */
import { humanizeSegment, ingestMarkdownTree, pathSegments } from "./markdown.js";
import type { DocChunk } from "../types.js";

const SECTION_LANDING_NAMES = new Set(["index", "readme"]);

export interface OpenWikiOptions {
  /** Root directory containing the OpenWiki-generated `openwiki/` tree. */
  rootDir: string;
}

/** Derive the wiki section path for a file, collapsing landing pages into their folder. */
export function wikiPathFor(relPath: string): string[] {
  const segments = pathSegments(relPath);
  const last = segments[segments.length - 1]?.toLowerCase();
  if (last && SECTION_LANDING_NAMES.has(last)) {
    return segments.slice(0, -1);
  }
  return segments;
}

export async function ingestOpenWikiTree(opts: OpenWikiOptions): Promise<DocChunk[]> {
  const chunks = await ingestMarkdownTree({ rootDir: opts.rootDir });

  return chunks.map((chunk) => {
    const wikiPath = wikiPathFor(chunk.path);
    return {
      ...chunk,
      wikiPath,
      breadcrumb: wikiPath.map(humanizeSegment).join(" > ") || "Home",
      sourceType: "openwiki" as const,
    };
  });
}
