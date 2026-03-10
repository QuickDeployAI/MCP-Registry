/**
 * Normalizer – converts a ParsedFeed + source info into canonical FeedItems
 * and native NativeItems.
 */
import { createHash } from "node:crypto";
import { parse as parseHtml } from "node-html-parser";
import type { FeedItem, NativeItem } from "../types.js";
import type { ParsedFeed, ParsedItem } from "./parser.js";

/** Strip HTML tags to produce plain text using node-html-parser. */
function stripHtml(html: string): string {
  const root = parseHtml(html);
  return root.structuredText.replace(/\s+/g, " ").trim();
}

/** Build a stable content hash from the item's key fields. */
function buildHash(item: ParsedItem, sourceUrl: string): string {
  const input = [
    sourceUrl,
    item.guid ?? "",
    item.link ?? "",
    item.title ?? "",
    item.isoDate ?? item.pubDate ?? "",
    item.contentEncoded ?? item.content ?? item.summary ?? "",
  ].join("|");
  return createHash("sha256").update(input).digest("hex");
}

/** Derive a stable unique ID for an item. */
function buildId(item: ParsedItem, sourceUrl: string): string {
  const base = item.guid ?? item.link ?? `${sourceUrl}::${item.title ?? ""}`;
  return createHash("sha256").update(base).digest("hex");
}

/** Normalise a single parsed item into a canonical FeedItem. */
function normalizeToInternal(
  item: ParsedItem,
  feed: ParsedFeed,
  sourceUrl: string,
  fetchedAt: string,
): FeedItem {
  const contentHtml = item.contentEncoded ?? item.content ?? null;
  const contentText = contentHtml ? stripHtml(contentHtml) : null;
  const hasFullContent = Boolean(contentHtml || contentText);

  // Prefer explicit isoDate; fall back to pubDate
  const publishedAt = item.isoDate
    ? item.isoDate
    : item.pubDate
      ? new Date(item.pubDate).toISOString()
      : null;

  return {
    id: buildId(item, sourceUrl),
    sourceName: feed.title ?? sourceUrl,
    sourceUrl,
    title: item.title ?? "(untitled)",
    link: item.link ?? "",
    author: item.author ?? null,
    publishedAt,
    updatedAt: null,
    summary: item.summary ?? null,
    contentText,
    contentHtml,
    categories: item.categories ?? [],
    language: feed.language ?? null,
    guid: item.guid ?? null,
    fetchedAt,
    contentHash: buildHash(item, sourceUrl),
    hasFullContent,
  };
}

/** Produce a NativeItem from a ParsedItem's rawFields, ready to store and expose. */
export function toNativeItem(item: ParsedItem): NativeItem {
  const native: NativeItem = { ...item.rawFields };
  // Remove any remaining internal-only keys
  delete native["isoDate"];
  delete native["contentSnippet"];
  return native;
}

/** Normalise a single parsed item into both internal and native representations. */
export function normalizeItem(
  item: ParsedItem,
  feed: ParsedFeed,
  sourceUrl: string,
  fetchedAt: string,
): { internal: FeedItem; native: NativeItem } {
  return {
    internal: normalizeToInternal(item, feed, sourceUrl, fetchedAt),
    native: toNativeItem(item),
  };
}

/** Normalise all items in a parsed feed. */
export function normalizeFeed(
  feed: ParsedFeed,
  sourceUrl: string,
): Array<{ internal: FeedItem; native: NativeItem }> {
  const now = new Date().toISOString();
  return feed.items.map((item) => normalizeItem(item, feed, sourceUrl, now));
}
