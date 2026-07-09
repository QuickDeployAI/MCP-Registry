/**
 * Use case: (re-)ingest a corpus directory into the store.
 *
 * Re-running this after the source tree changes is the "re-index on
 * wiki-update" path. Content-hash dedup in corpus-core means unchanged
 * chunks are true no-ops; changed or new chunks are added as new items.
 *
 * Known limitation (documented, not silently hidden): corpus-core's
 * StoreAdapter has no delete-by-path operation, so a chunk removed or
 * reworded upstream leaves its previous version queryable as a stale
 * item until the process restarts. `staleCandidateCount` surfaces this
 * so operators can decide whether to restart the server after large
 * edits instead of relying solely on incremental refresh.
 */
import type { StoreAdapter } from "@quickdeployai/corpus-core";
import { inspectSchema } from "@quickdeployai/corpus-core";
import { ingestMarkdownTree } from "../ingestion/markdown.js";
import { ingestOpenWikiTree } from "../ingestion/openwiki.js";
import type { DocChunk, ToolError } from "../types.js";

export interface RefreshCorpusOptions {
  corpusId: string;
  sourceDir: string;
  sourceType: "markdown" | "openwiki";
}

export interface RefreshResult {
  corpusId: string;
  sourceDir: string;
  chunksWalked: number;
  newChunks: number;
  staleCandidateCount: number;
}

export class RefreshCorpusUseCase {
  constructor(private readonly store: StoreAdapter<DocChunk>) {}

  async execute(opts: RefreshCorpusOptions): Promise<RefreshResult | ToolError> {
    try {
      const chunks =
        opts.sourceType === "openwiki"
          ? await ingestOpenWikiTree({ rootDir: opts.sourceDir })
          : await ingestMarkdownTree({ rootDir: opts.sourceDir });

      const alreadyInitialized = this.store.hasFeed(opts.corpusId);
      if (!alreadyInitialized) {
        await this.store.initFeed(opts.corpusId, opts.corpusId);
      }

      const newChunks = await this.store.ingest(opts.corpusId, chunks);
      await this.store.recordRefreshAttempt(opts.corpusId, { success: true });

      const allItems = await this.store.getAllItems(opts.corpusId);
      const schema = inspectSchema(opts.corpusId, allItems);
      await this.store.storeObservedSchema(opts.corpusId, schema);

      // Chunks now on disk whose path is no longer present at all indicate
      // deleted pages; their stored items are pure stale leftovers.
      const walkedPaths = new Set(chunks.map((c) => c.path));
      const staleCandidateCount = allItems.filter(
        (item) => !walkedPaths.has(item.path as string),
      ).length;

      return {
        corpusId: opts.corpusId,
        sourceDir: opts.sourceDir,
        chunksWalked: chunks.length,
        newChunks,
        staleCandidateCount,
      };
    } catch (err) {
      const msg = (err as Error).message;
      if (this.store.hasFeed(opts.corpusId)) {
        await this.store.recordRefreshAttempt(opts.corpusId, { success: false, error: msg });
      }
      return {
        error: "Ingestion failed",
        reason: msg,
        suggestion: "Check that sourceDir exists and contains markdown files.",
      };
    }
  }
}
