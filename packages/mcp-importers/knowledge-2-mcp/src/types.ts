/**
 * Core types for the knowledge-2-mcp corpus.
 */
import type { FeedQuery, QueryResult } from "@quickdeployai/corpus-core";

/** A single citable chunk of a document, stored as a corpus-core NativeItem. */
export interface DocChunk {
  /** Path of the source file, relative to the ingested root. */
  path: string;
  /** Absolute wiki path segments, e.g. ["guides", "getting-started"]. */
  wikiPath: string[];
  /** Human-readable breadcrumb, e.g. "Guides > Getting Started". */
  breadcrumb: string;
  /** Document-level title (frontmatter title, first H1, or humanized filename). */
  title: string;
  /** Heading text for this chunk ("" for the lead-in chunk before the first heading). */
  heading: string;
  /** 1-6, or 0 for the lead-in chunk. */
  headingLevel: number;
  /** Ancestor heading titles, outermost first. */
  headingTrail: string[];
  /** Chunk body text (markdown, heading line stripped). */
  content: string;
  /** Frontmatter tags, if any. */
  tags: string[];
  /** Identifies the ingestion adapter that produced this chunk. */
  sourceType: "markdown-tree" | "openwiki";
  [key: string]: unknown;
}

/** Query input for searching the corpus. Re-exported from corpus-core under a clearer name. */
export type CorpusQuery = FeedQuery;
export type CorpusQueryResult = QueryResult;

/** Structured error returned from tools (corpus-core does not export this type itself). */
export interface ToolError {
  error: string;
  reason: string;
  suggestion?: string;
}
