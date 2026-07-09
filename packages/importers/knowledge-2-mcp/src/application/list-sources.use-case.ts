/**
 * Use case: summarize the ingested corpus — chunk count, distinct pages,
 * and the top-level wiki sections discovered.
 */
import type { StoreAdapter } from "@quickdeployai/corpus-core";
import type { DocChunk, ToolError } from "../types.js";

export interface SourcesSummary {
  corpusId: string;
  chunkCount: number;
  pageCount: number;
  sections: string[];
  lastRefreshAttemptedAt: string | null;
  lastRefreshSucceededAt: string | null;
  lastRefreshError: string | null;
}

export class ListSourcesUseCase {
  constructor(private readonly store: StoreAdapter<DocChunk>) {}

  async execute(corpusId: string): Promise<SourcesSummary | ToolError> {
    const info = await this.store.getFeedInfo(corpusId);
    if (!info) {
      return {
        error: "Corpus not found",
        reason: `No data ingested for corpus: ${corpusId}`,
        suggestion: "Call refresh first to ingest the source directory.",
      };
    }

    const items = await this.store.getAllItems(corpusId);
    const pages = new Set(items.map((i) => i.path));
    const sections = new Set(items.map((i) => i.wikiPath[0]).filter((s): s is string => Boolean(s)));

    return {
      corpusId,
      chunkCount: items.length,
      pageCount: pages.size,
      sections: [...sections].sort(),
      lastRefreshAttemptedAt: info.lastRefreshAttemptedAt,
      lastRefreshSucceededAt: info.lastRefreshSucceededAt,
      lastRefreshError: info.lastRefreshError,
    };
  }
}
