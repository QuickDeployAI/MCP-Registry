/**
 * File-based store adapter.
 *
 * Persists all feed items and metadata as newline-delimited JSON (NDJSON)
 * files under a configured directory.  On startup the store reloads
 * persisted data so items survive server restarts.
 *
 * Layout under storagePath/:
 *   <urlHash>/items.ndjson         – one FeedItem per line
 *   <urlHash>/native-items.ndjson  – one NativeItem per line (same order)
 *   <urlHash>/meta.json            – FeedInfo object
 *   <urlHash>/schema.json          – ObservedFeedSchema
 *
 * Writes are append-on-ingest and full-rewrite on metadata changes.
 * The store keeps an in-memory index for fast querying; the files
 * provide durability only.
 */
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  appendFile,
  readdir,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { FeedItem, FeedInfo, NativeItem, ObservedFeedSchema } from "../types.js";
import type { RefreshOutcome, StoreAdapter, IngestPair } from "./adapter.js";
import { MemoryStore } from "./index.js";

function feedDirName(feedUrl: string): string {
  return createHash("sha256").update(feedUrl).digest("hex").slice(0, 16);
}

export class FileStore implements StoreAdapter {
  /** In-memory index for fast querying – the source of truth for reads. */
  private memory: MemoryStore;

  constructor(
    private readonly storagePath: string,
    private readonly maxItems: number,
  ) {
    this.memory = new MemoryStore(maxItems);
  }

  /** Load all persisted feeds from disk into memory. Call once at startup. */
  async load(): Promise<void> {
    if (!existsSync(this.storagePath)) return;

    let entries: string[];
    try {
      entries = await readdir(this.storagePath);
    } catch {
      return;
    }

    for (const dir of entries) {
      const metaPath = join(this.storagePath, dir, "meta.json");
      const itemsPath = join(this.storagePath, dir, "items.ndjson");
      const nativePath = join(this.storagePath, dir, "native-items.ndjson");
      const schemaPath = join(this.storagePath, dir, "schema.json");
      if (!existsSync(metaPath)) continue;

      const meta: FeedInfo = JSON.parse(await readFile(metaPath, "utf-8"));
      await this.memory.initFeed(meta.feedUrl, meta.feedTitle);

      // Restore metadata
      const currentInfo = await this.memory.getFeedInfo(meta.feedUrl);
      if (currentInfo) {
        Object.assign(currentInfo, meta);
      }

      if (existsSync(itemsPath)) {
        const itemLines = (await readFile(itemsPath, "utf-8"))
          .split("\n")
          .filter(Boolean);
        const items: FeedItem[] = itemLines.map((l) => JSON.parse(l));

        let nativeItemsById: Record<string, NativeItem> = {};
        if (existsSync(nativePath)) {
          const nativeLines = (await readFile(nativePath, "utf-8"))
            .split("\n")
            .filter(Boolean);
          const nativeItems: NativeItem[] = nativeLines.map((l) => JSON.parse(l));
          items.forEach((item, i) => {
            nativeItemsById[item.id] = nativeItems[i] ?? {};
          });
        }

        const pairs: IngestPair[] = items.map((item) => ({
          internal: item,
          native: nativeItemsById[item.id] ?? {},
        }));

        await this.memory.ingest(meta.feedUrl, pairs);

        const info = await this.memory.getFeedInfo(meta.feedUrl);
        if (info) {
          info.newItemsOnLastRefresh = meta.newItemsOnLastRefresh;
          info.itemCount = meta.itemCount;
        }
      }

      if (existsSync(schemaPath)) {
        const schema: ObservedFeedSchema = JSON.parse(
          await readFile(schemaPath, "utf-8"),
        );
        await this.memory.storeObservedSchema(meta.feedUrl, schema);
      }
    }
  }

  private async feedDir(feedUrl: string): Promise<string> {
    const dir = join(this.storagePath, feedDirName(feedUrl));
    await mkdir(dir, { recursive: true });
    return dir;
  }

  private async writeMeta(feedUrl: string): Promise<void> {
    const info = await this.memory.getFeedInfo(feedUrl);
    if (!info) return;
    const dir = await this.feedDir(feedUrl);
    await writeFile(join(dir, "meta.json"), JSON.stringify(info, null, 2), "utf-8");
  }

  async initFeed(feedUrl: string, feedTitle: string | null): Promise<void> {
    await this.memory.initFeed(feedUrl, feedTitle);
    await this.writeMeta(feedUrl);
  }

  async ingest(feedUrl: string, incoming: IngestPair[]): Promise<number> {
    const existingIds = new Set(
      (await this.memory.getAllItems(feedUrl)).map((i) => i.id),
    );
    const newCount = await this.memory.ingest(feedUrl, incoming);
    if (newCount > 0) {
      const newPairs = incoming.filter((p) => !existingIds.has(p.internal.id));
      if (newPairs.length > 0) {
        const dir = await this.feedDir(feedUrl);
        const itemLines = newPairs.map((p) => JSON.stringify(p.internal)).join("\n") + "\n";
        await appendFile(join(dir, "items.ndjson"), itemLines, "utf-8");
        const nativeLines = newPairs.map((p) => JSON.stringify(p.native)).join("\n") + "\n";
        await appendFile(join(dir, "native-items.ndjson"), nativeLines, "utf-8");
      }
    }
    return newCount;
  }

  async recordRefreshAttempt(
    feedUrl: string,
    outcome: RefreshOutcome,
  ): Promise<void> {
    await this.memory.recordRefreshAttempt(feedUrl, outcome);
    await this.writeMeta(feedUrl);
  }

  async updatePollingMeta(
    feedUrl: string,
    pollingEnabled: boolean,
    pollIntervalMs: number | null,
  ): Promise<void> {
    await this.memory.updatePollingMeta(feedUrl, pollingEnabled, pollIntervalMs);
    await this.writeMeta(feedUrl);
  }

  async getFeedInfo(feedUrl: string): Promise<FeedInfo | null> {
    return this.memory.getFeedInfo(feedUrl);
  }

  async getItem(feedUrl: string, id: string): Promise<FeedItem | null> {
    return this.memory.getItem(feedUrl, id);
  }

  async getAllItems(feedUrl: string): Promise<FeedItem[]> {
    return this.memory.getAllItems(feedUrl);
  }

  hasFeed(feedUrl: string): boolean {
    return this.memory.hasFeed(feedUrl);
  }

  async storeObservedSchema(feedUrl: string, schema: ObservedFeedSchema): Promise<void> {
    await this.memory.storeObservedSchema(feedUrl, schema);
    const dir = await this.feedDir(feedUrl);
    await writeFile(join(dir, "schema.json"), JSON.stringify(schema, null, 2), "utf-8");
  }

  async getObservedSchema(feedUrl: string): Promise<ObservedFeedSchema | null> {
    return this.memory.getObservedSchema(feedUrl);
  }

  async getNativeItem(feedUrl: string, id: string): Promise<NativeItem | null> {
    return this.memory.getNativeItem(feedUrl, id);
  }

  async getAllNativeItems(feedUrl: string): Promise<NativeItem[]> {
    return this.memory.getAllNativeItems(feedUrl);
  }

  async close(): Promise<void> {
    await this.memory.close();
  }
}
