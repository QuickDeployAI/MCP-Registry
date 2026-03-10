/**
 * Feed parser – wraps rss-parser to produce a unified ParsedFeed shape.
 */
import Parser from "rss-parser";
import type { NativeItem } from "../types.js";

/** rss-parser internal fields that should not be exposed as native fields. */
const INTERNAL_PARSER_KEYS = new Set(["isoDate", "contentSnippet", "_", "$"]);

/** camelCase rss-parser keys mapped back to their native colon-separated names. */
const CAMEL_TO_NATIVE: Record<string, string> = {
  contentEncoded: "content:encoded",
  creator: "dc:creator",
};

/** Collect all enumerable fields from an rss-parser item as a NativeItem. */
function buildRawFields(
  item: Record<string, unknown>,
  resolvedAuthor: string | undefined,
): NativeItem {
  const raw: NativeItem = {};

  for (const [key, value] of Object.entries(item)) {
    if (INTERNAL_PARSER_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue;

    const nativeKey = CAMEL_TO_NATIVE[key] ?? key;

    // Skip if already captured under native name
    if (nativeKey !== key && raw[nativeKey] !== undefined) continue;

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      Array.isArray(value) ||
      (typeof value === "object")
    ) {
      raw[nativeKey] = value;
    }
  }

  // Prefer dc:creator over author when both present
  if (resolvedAuthor && !raw["dc:creator"] && !raw["author"]) {
    raw["author"] = resolvedAuthor;
  }

  return raw;
}

export interface ParsedItem {
  guid?: string;
  title?: string;
  link?: string;
  author?: string;
  pubDate?: string;
  isoDate?: string;
  summary?: string;
  contentEncoded?: string;
  content?: string;
  categories?: string[];
  /** All raw fields as parsed, keyed by their native name. */
  rawFields: NativeItem;
}

export interface ParsedFeed {
  title?: string;
  feedUrl?: string;
  description?: string;
  language?: string;
  items: ParsedItem[];
}

const parser = new Parser({
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["dc:creator", "author"],
    ],
  },
});

export async function parseFeedXml(xml: string): Promise<ParsedFeed> {
  const feed = await parser.parseString(xml);
  return {
    title: feed.title,
    feedUrl: feed.feedUrl,
    description: feed.description,
    language: feed.language,
    items: (feed.items ?? []).map((item) => {
      const raw = item as unknown as Record<string, unknown>;
      const resolvedAuthor = (raw["author"] as string | undefined) ?? item.creator;
      return {
        guid: item.guid,
        title: item.title,
        link: item.link,
        author: resolvedAuthor,
        pubDate: item.pubDate,
        isoDate: item.isoDate,
        summary: item.summary ?? item.contentSnippet,
        contentEncoded: raw["contentEncoded"] as string | undefined,
        content: item.content,
        categories: item.categories,
        rawFields: buildRawFields(raw, resolvedAuthor),
      };
    }),
  };
}
