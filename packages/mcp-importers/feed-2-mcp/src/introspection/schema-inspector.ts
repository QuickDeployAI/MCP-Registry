/**
 * Schema inspector – derives an ObservedFeedSchema by scanning the actual
 * items stored for a feed.
 *
 * No field-name constants. Filterable/sortable/searchable are derived purely
 * from the inferred runtime type of each field's values.
 */
import { parse as parseHtml } from "node-html-parser";
import type { NativeItem, ObservedFeedSchema, ObservedFieldSchema } from "../types.js";

const EXAMPLE_MAX_LENGTH = 120;
const LARGE_FIELD_AVG_LENGTH = 500;

const DATETIME_OPERATORS = ["==", "!=", "=gt=", "=ge=", "=lt=", "=le="];
const STRING_OPERATORS = ["==", "!=", "=like="];
// Booleans support equality and inequality so callers can filter `flag==true` or `flag!=false`.
const BOOLEAN_OPERATORS = ["==", "!="];
const NUMBER_OPERATORS = ["==", "!=", "=gt=", "=ge=", "=lt=", "=le="];
const ARRAY_OPERATORS = ["=contains="];

/** Strip HTML tags from a string using node-html-parser. */
function stripHtmlTags(html: string): string {
  return parseHtml(html).structuredText.replace(/\s+/g, " ").trim();
}

/** Infer the type of a value. */
type FieldType = ObservedFieldSchema["type"];

function inferType(value: unknown): FieldType {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "string[]";
  if (value !== null && typeof value === "object") return "object";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return "datetime";
    return "string";
  }
  return "string";
}

/** Determine if a value is non-empty for presence counting. */
function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Build an example string from a value (truncated, HTML stripped). */
function buildExample(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let str: string;
  if (typeof value === "string") {
    str = stripHtmlTags(value);
  } else if (Array.isArray(value)) {
    str = value.map(String).join(", ");
  } else if (typeof value === "object") {
    try { str = JSON.stringify(value); } catch { return null; }
  } else {
    str = String(value);
  }
  return str.length > EXAMPLE_MAX_LENGTH ? str.slice(0, EXAMPLE_MAX_LENGTH) + "…" : str;
}

/** Derive operator list based on field type. */
function getAllowedOperators(type: FieldType): string[] {
  switch (type) {
    case "datetime": return DATETIME_OPERATORS;
    case "number":   return NUMBER_OPERATORS;
    case "string":   return STRING_OPERATORS;
    case "boolean":  return BOOLEAN_OPERATORS;
    default:         return ARRAY_OPERATORS;
  }
}

/** Collect all top-level keys from all items. */
function collectAllKeys(items: NativeItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of items) {
    for (const key of Object.keys(item)) keys.add(key);
  }
  return keys;
}

interface FieldStats {
  presentCount: number;
  exampleValue: unknown;
  totalCharLength: number;
  charValueCount: number;
  dominantType: FieldType;
}

/** Gather per-field statistics across all items. */
function gatherFieldStats(items: NativeItem[], allKeys: Set<string>): Map<string, FieldStats> {
  const stats = new Map<string, FieldStats>();
  for (const key of allKeys) {
    stats.set(key, { presentCount: 0, exampleValue: null, totalCharLength: 0, charValueCount: 0, dominantType: "string" });
  }
  for (const item of items) {
    for (const key of allKeys) {
      const value = item[key];
      if (!hasValue(value)) continue;
      const st = stats.get(key)!;
      st.presentCount++;
      if (st.exampleValue === null) {
        st.exampleValue = value;
        st.dominantType = inferType(value);
      }
      if (typeof value === "string") {
        st.totalCharLength += value.length;
        st.charValueCount++;
      }
    }
  }
  return stats;
}

/** Build a single ObservedFieldSchema from collected stats. */
function buildFieldSchema(name: string, stats: FieldStats, itemCount: number): ObservedFieldSchema {
  const presence = itemCount > 0 ? stats.presentCount / itemCount : 0;
  const avgLen = stats.charValueCount > 0 ? stats.totalCharLength / stats.charValueCount : 0;
  const large = avgLen > LARGE_FIELD_AVG_LENGTH;
  const type = stats.dominantType;

  // Derived purely from the inferred runtime type — no hardcoded field name lists.
  const filterable = type === "string" || type === "datetime" || type === "number" || type === "boolean";
  const sortable = type === "string" || type === "datetime" || type === "number";
  const searchable = type === "string" && !large;

  return {
    name,
    type,
    presence: Math.round(presence * 1000) / 1000,
    selectable: true,
    filterable,
    searchable,
    sortable,
    large,
    example: buildExample(stats.exampleValue),
    allowedOperators: getAllowedOperators(type),
  };
}

/** Sort fields: non-large first, then large; within each group alphabetically. */
function sortFields(fields: ObservedFieldSchema[]): ObservedFieldSchema[] {
  return [...fields].sort((a, b) => {
    if (a.large !== b.large) return a.large ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Derive an ObservedFeedSchema by scanning the items of a feed.
 *
 * @param feedUrl   The URL of the feed.
 * @param items     Raw items as stored (any shape — no assumptions made).
 * @param sourceFormat  The feed format, using output vocabulary directly:
 *                  "rss2" | "atom" | "rss1" | "jsonfeed" | "unknown".
 */
export function inspectSchema(
  feedUrl: string,
  items: NativeItem[],
  sourceFormat: ObservedFeedSchema["sourceFormat"] = "unknown",
): ObservedFeedSchema {
  if (items.length === 0) {
    return { feedUrl, sourceFormat, observedAt: new Date().toISOString(), itemCount: 0, fields: [] };
  }

  const allKeys = collectAllKeys(items);
  const stats = gatherFieldStats(items, allKeys);
  const fields = sortFields(
    [...allKeys].map((key) => buildFieldSchema(key, stats.get(key)!, items.length)),
  );

  return { feedUrl, sourceFormat, observedAt: new Date().toISOString(), itemCount: items.length, fields };
}
