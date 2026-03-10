/**
 * Internal schema metadata describing every field in FeedItem.
 *
 * INTERNAL ONLY – not exposed publicly. Use ObservedFeedSchema for the public API.
 * These constants are used internally by the query executor for validation.
 */
import type { FieldMeta } from "./types.js";

export const FEED_ITEM_SCHEMA: FieldMeta[] = [
  {
    name: "id",
    type: "string",
    selectable: true,
    filterable: true,
    searchable: false,
    sortable: false,
    large: false,
    allowedOperators: ["==", "!="],
    description: "Unique internal identifier for the item.",
  },
  {
    name: "sourceName",
    type: "string",
    selectable: true,
    filterable: true,
    searchable: false,
    sortable: false,
    large: false,
    allowedOperators: ["==", "!="],
    description: "Name of the feed source.",
  },
  {
    name: "sourceUrl",
    type: "string",
    selectable: true,
    filterable: false,
    searchable: false,
    sortable: false,
    large: false,
    description: "URL of the configured feed.",
  },
  {
    name: "title",
    type: "string",
    selectable: true,
    filterable: true,
    searchable: true,
    sortable: true,
    large: false,
    allowedOperators: ["==", "!=", "=like="],
    description: "Article title.",
  },
  {
    name: "link",
    type: "string",
    selectable: true,
    filterable: false,
    searchable: false,
    sortable: false,
    large: false,
    description: "Canonical link to the article.",
  },
  {
    name: "author",
    type: "string",
    selectable: true,
    filterable: true,
    searchable: false,
    sortable: true,
    large: false,
    allowedOperators: ["==", "!="],
    description: "Author name.",
  },
  {
    name: "publishedAt",
    type: "datetime",
    selectable: true,
    filterable: true,
    searchable: false,
    sortable: true,
    large: false,
    allowedOperators: ["==", "!=", "=gt=", "=ge=", "=lt=", "=le="],
    description: "Publication date (ISO-8601).",
  },
  {
    name: "updatedAt",
    type: "datetime",
    selectable: true,
    filterable: true,
    searchable: false,
    sortable: true,
    large: false,
    allowedOperators: ["==", "!=", "=gt=", "=ge=", "=lt=", "=le="],
    description: "Last-updated date (ISO-8601).",
  },
  {
    name: "summary",
    type: "string",
    selectable: true,
    filterable: false,
    searchable: true,
    sortable: false,
    large: false,
    description: "Short summary / excerpt.",
  },
  {
    name: "contentText",
    type: "string",
    selectable: true,
    filterable: false,
    searchable: true,
    sortable: false,
    large: true,
    description:
      "Full plain-text body. LARGE FIELD – request only for specific items.",
  },
  {
    name: "contentHtml",
    type: "string",
    selectable: true,
    filterable: false,
    searchable: false,
    sortable: false,
    large: true,
    description:
      "Full HTML body. LARGE FIELD – request only for specific items.",
  },
  {
    name: "categories",
    type: "string[]",
    selectable: true,
    filterable: true,
    searchable: false,
    sortable: false,
    large: false,
    allowedOperators: ["=contains="],
    description: "Category / tag list.",
  },
  {
    name: "language",
    type: "string",
    selectable: true,
    filterable: true,
    searchable: false,
    sortable: false,
    large: false,
    allowedOperators: ["==", "!="],
    description: "Language tag (e.g. 'en').",
  },
  {
    name: "guid",
    type: "string",
    selectable: true,
    filterable: true,
    searchable: false,
    sortable: false,
    large: false,
    allowedOperators: ["==", "!="],
    description: "Original GUID from the feed.",
  },
  {
    name: "fetchedAt",
    type: "datetime",
    selectable: true,
    filterable: true,
    searchable: false,
    sortable: true,
    large: false,
    allowedOperators: ["==", "!=", "=gt=", "=ge=", "=lt=", "=le="],
    description: "Timestamp when this item was first ingested.",
  },
  {
    name: "contentHash",
    type: "string",
    selectable: true,
    filterable: false,
    searchable: false,
    sortable: false,
    large: false,
    description: "SHA-256 hash used for deduplication.",
  },
  {
    name: "hasFullContent",
    type: "boolean",
    selectable: true,
    filterable: true,
    searchable: false,
    sortable: false,
    large: false,
    allowedOperators: ["=="],
    description: "True if contentText or contentHtml is available.",
  },
];

/** Set of field names that are large / expensive by default. */
export const LARGE_FIELDS = new Set(
  FEED_ITEM_SCHEMA.filter((f) => f.large).map((f) => f.name),
);

/** Default compact field set returned when no select is specified. */
export const DEFAULT_SELECT: (keyof import("./types.js").FeedItem)[] = [
  "id",
  "title",
  "link",
  "publishedAt",
  "summary",
];

/** All selectable field names. */
export const SELECTABLE_FIELDS = new Set(
  FEED_ITEM_SCHEMA.filter((f) => f.selectable).map((f) => f.name),
);

/** All filterable field names. */
export const FILTERABLE_FIELDS = new Set(
  FEED_ITEM_SCHEMA.filter((f) => f.filterable).map((f) => f.name),
);

/** All searchable field names. */
export const SEARCHABLE_FIELDS = FEED_ITEM_SCHEMA.filter(
  (f) => f.searchable,
).map((f) => f.name);

/** All sortable field names. */
export const SORTABLE_FIELDS = new Set(
  FEED_ITEM_SCHEMA.filter((f) => f.sortable).map((f) => f.name),
);
