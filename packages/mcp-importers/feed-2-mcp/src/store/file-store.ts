/**
 * File-based store adapter.
 *
 * Generic over TItem. Persists items as newline-delimited JSON (NDJSON)
 * files under a configured directory so they survive server restarts.
 *
 * Layout under storagePath/:
 *   <urlHash>/items.ndjson   – one StoredItem per line
 *   <urlHash>/meta.json      – FeedInfo object
 *   <urlHash>/schema.json    – ObservedFeedSchema
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
import type { FeedInfo, NativeItem, ObservedFeedSchema } from "../types.js";
import type { RefreshOutcome, StoreAdapter, StoredItem } from "./adapter.js";
import { MemoryStore } from "./index.js";

function feedDirName(feedUrl: string): string {
  return createHash("sha256").update(feedUrl).digest("hex").slice(0, 16);
}

export class FileStore<TItem extends NativeItem = NativeItem> implements StoreAdapter<TItem> {
  private memory: MemoryStore<TItem>;

  constructor(
    private readonly storagePath: string,
    private readonly maxItems: number,
  ) {
    this.memory = new MemoryStore<TItem>(maxItems);
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
      const schemaPath = join(this.storagePath, dir, "schema.json");
      if (!existsSync(metaPath)) continue;

      const meta: FeedInfo = JSON.parse(await readFile(metaPath, "utf-8"));
      await this.memory.initFeed(meta.feedUrl, meta.feedTitle);

      // Restore metadata
      const currentInfo = await this.memory.getFeedInfo(meta.feedUrl);
      if (currentInfo) Object.assign(currentInfo, meta);

      if (existsSync(itemsPath)) {
        const lines = (await readFile(itemsPath, "utf-8")).split("\n").filter(Boolean);
        // Items were persisted already augmented with _id/_fetchedAt.
        // Restore them directly (preserving original _fetchedAt) via restoreItems.
        const stored = lines
          .map((line) => { try { return JSON.parse(line) as StoredItem<TItem>; } catch { return null; } })
          .filter((i): i is StoredItem<TItem> => i !== null);
        if (stored.length > 0) await this.memory.restoreItems(meta.feedUrl, stored);

        // Restore itemCount from persisted metadata (restoreItems may cap at maxItems)
        const info = await this.memory.getFeedInfo(meta.feedUrl);
        if (info) {
          info.newItemsOnLastRefresh = meta.newItemsOnLastRefresh;
          info.itemCount = meta.itemCount;
        }
      }

      if (existsSync(schemaPath)) {
        const schema: ObservedFeedSchema = JSON.parse(await readFile(schemaPath, "utf-8"));
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

  async ingest(feedUrl: string, incoming: TItem[]): Promise<number> {
    const before = new Set((await this.memory.getAllItems(feedUrl)).map((i) => i._id));
    const newCount = await this.memory.ingest(feedUrl, incoming);
    if (newCount > 0) {
      const newItems = (await this.memory.getAllItems(feedUrl)).filter(
        (i) => !before.has(i._id),
      );
      if (newItems.length > 0) {
        const dir = await this.feedDir(feedUrl);
        const lines = newItems.map((i) => JSON.stringify(i)).join("\n") + "\n";
        await appendFile(join(dir, "items.ndjson"), lines, "utf-8");
      }
    }
    return newCount;
  }

  async recordRefreshAttempt(feedUrl: string, outcome: RefreshOutcome): Promise<void> {
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

  async getItem(feedUrl: string, id: string): Promise<StoredItem<TItem> | null> {
    return this.memory.getItem(feedUrl, id);
  }

  async getAllItems(feedUrl: string): Promise<StoredItem<TItem>[]> {
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

  async close(): Promise<void> {
    await this.memory.close();
  }
}
