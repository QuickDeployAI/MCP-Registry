import type { ObservedFeedSchema } from "../types.js";

/** Maps feedsmith's native format identifier to the ObservedFeedSchema sourceFormat vocabulary. */
const FEEDSMITH_TO_SOURCE_FORMAT: Record<string, ObservedFeedSchema["sourceFormat"]> = {
  rss: "rss2",
  atom: "atom",
  rdf: "rss1",
  json: "jsonfeed",
};

/**
 * Convert a feedsmith `parseFeed` format string to the `ObservedFeedSchema.sourceFormat`
 * vocabulary ("rss2" | "atom" | "rss1" | "jsonfeed" | "unknown").
 */
export function toSourceFormat(format: string): ObservedFeedSchema["sourceFormat"] {
  return FEEDSMITH_TO_SOURCE_FORMAT[format] ?? "unknown";
}

/**
 * Feed utilities – helpers for working with feedsmith envelopes.
 *
 * These helpers operate on the feedsmith ENVELOPE (the output of parseFeed),
 * not on individual items. Item structure is caller-defined via the TItem
 * generic — the server makes no assumptions about item fields.
 */
import { createHash } from "node:crypto";
import type { parseFeed } from "feedsmith";
import type { Rss, Atom, Rdf, Json } from "feedsmith/types";

type FeedEnvelope = ReturnType<typeof parseFeed>;

// ── Content hash ─────────────────────────────────────────────────────────────

/**
 * SHA-256 hash of a raw feedsmith item, used as the stable `_id` for storage
 * and deduplication. The hash is computed before any metadata is added.
 *
 * Key ordering in JSON.stringify follows insertion order (V8 / Node.js), which
 * is stable within a single process. Items coming out of feedsmith always have
 * the same key order for the same input, so the hash is stable for identical items.
 */
export function computeContentHash(item: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(item)).digest("hex");
}

// ── Feed-level metadata ──────────────────────────────────────────────────────

/** Extract title/description/language from any feedsmith envelope. */
export function extractFeedMeta(envelope: FeedEnvelope): {
  title: string | undefined;
  description: string | undefined;
  language: string | undefined;
} {
  const { format, feed } = envelope;
  if (format === "rss") {
    const f = feed as Rss.Feed<string>;
    return { title: f.title, description: f.description, language: f.language };
  }
  if (format === "atom") {
    const f = feed as Atom.Feed<string>;
    return { title: f.title, description: f.subtitle, language: undefined };
  }
  if (format === "json") {
    const f = feed as Json.Feed<string>;
    return { title: f.title, description: f.description, language: f.language };
  }
  // rdf
  const f = feed as Rdf.Feed<string>;
  return { title: f.title, description: f.description, language: undefined };
}

// ── Item extraction ──────────────────────────────────────────────────────────

/** Return the raw item array from any feedsmith envelope as-is. */
export function extractItems(envelope: FeedEnvelope): Record<string, unknown>[] {
  if (envelope.format === "atom") {
    return (envelope.feed as Atom.Feed<string>).entries ?? [];
  }
  return ((envelope.feed as { items?: unknown[] }).items ?? []) as Record<string, unknown>[];
}
