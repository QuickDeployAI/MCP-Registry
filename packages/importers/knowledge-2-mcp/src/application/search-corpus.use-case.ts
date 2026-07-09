/**
 * Use case: search a corpus with filter/full-text/sort/pagination, returning
 * results annotated with citation metadata (path, breadcrumb, heading).
 */
import { executeQuery } from "@quickdeployai/corpus-core";
import type { StoreAdapter } from "@quickdeployai/corpus-core";
import type { CorpusQuery, DocChunk, ToolError } from "../types.js";

export interface SearchOptions {
  maxResults: number;
  maxFieldSize: number;
}

export interface SearchHit {
  id: string;
  citation: string;
  path: string;
  breadcrumb: string;
  title: string;
  heading: string;
  snippet: string;
}

export interface SearchResult {
  corpusId: string;
  hits: SearchHit[];
  totalMatched: number;
  returned: number;
  skip: number;
  top: number;
}

function citationFor(item: DocChunk): string {
  return item.heading ? `${item.breadcrumb} > ${item.heading}` : item.breadcrumb;
}

function snippetFor(content: string, maxFieldSize: number): string {
  return content.length > maxFieldSize ? `${content.slice(0, maxFieldSize)}…` : content;
}

export class SearchCorpusUseCase {
  constructor(
    private readonly store: StoreAdapter<DocChunk>,
    private readonly opts: SearchOptions,
  ) {}

  async execute(corpusId: string, query: CorpusQuery): Promise<SearchResult | ToolError> {
    if (!this.store.hasFeed(corpusId)) {
      return {
        error: "Corpus not found",
        reason: `No data ingested for corpus: ${corpusId}`,
        suggestion: "Call refresh first to ingest the source directory.",
      };
    }

    const items = await this.store.getAllItems(corpusId);
    // `content` is deliberately excluded from `select`: corpus-core's projector
    // replaces any string field over its own fixed 500-char threshold with an
    // opaque large-field marker, regardless of our maxFieldSize. We fetch the
    // raw content ourselves below and snippet it with our own configured size.
    const result = executeQuery(items, { ...query, select: ["_id", "path", "breadcrumb", "title", "heading"] }, {
      maxResults: this.opts.maxResults,
      maxFieldSize: this.opts.maxFieldSize,
    });

    if (result.errors) {
      return {
        error: "Invalid query",
        reason: result.errors.map((e) => `${e.field}: ${e.message}`).join("; "),
      };
    }

    const byId = new Map(items.map((item) => [item._id, item]));
    const { items: page, totalMatched, returned, skip, top } = result.result!;
    const hits: SearchHit[] = page.map((record) => {
      const id = record._id as string;
      const raw = byId.get(id);
      const item = { ...raw, ...record } as unknown as DocChunk & { _id: string };
      return {
        id,
        citation: citationFor(item),
        path: item.path,
        breadcrumb: item.breadcrumb,
        title: item.title,
        heading: item.heading,
        snippet: snippetFor(String(raw?.content ?? ""), this.opts.maxFieldSize),
      };
    });

    return { corpusId, hits, totalMatched, returned, skip, top };
  }
}
