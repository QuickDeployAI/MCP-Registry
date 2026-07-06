/**
 * Store factory – creates the appropriate StoreAdapter from configuration.
 */
import type { StoreAdapter } from "./adapter.js";
import { MemoryStore } from "./index.js";
import { FileStore } from "./file-store.js";
import { VectorStore, type EmbeddingProvider } from "./vector-store.js";

export type StorageBackend = "memory" | "file" | "vector";

export interface StoreFactoryOptions {
  backend: StorageBackend;
  storagePath?: string;
  maxItems: number;
  embedder?: EmbeddingProvider;
}

export function createStore(opts: StoreFactoryOptions): StoreAdapter {
  switch (opts.backend) {
    case "file":
      return new FileStore(opts.storagePath ?? "./rss2mcp-data", opts.maxItems);
    case "vector":
      return new VectorStore(
        opts.storagePath ?? "./rss2mcp-data",
        opts.maxItems,
        opts.embedder ?? null,
      );
    default:
      return new MemoryStore(opts.maxItems);
  }
}
