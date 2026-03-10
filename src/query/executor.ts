/**
 * Query executor.
 *
 * Takes a FeedQuery, validates it, applies filters/search/sort/page,
 * then projects the requested fields onto the result set.
 * Native field names (e.g. "pubDate", "dc:creator") are resolved to
 * internal FeedItem fields via the alias registry for filter/sort;
 * projection supports both native and internal field names.
 *
 * Large fields (contentText, contentHtml) are NEVER returned inline — even
 * when explicitly selected. Use get_feed_item to retrieve them.
 */
import {
  SORTABLE_FIELDS,
  DEFAULT_SELECT,
  LARGE_FIELDS,
} from "../schema.js";
import type {
  FeedItem,
  FeedItemRecord,
  FeedQuery,
  NativeItem,
  QueryResult,
} from "../types.js";
import { NATIVE_TO_INTERNAL } from "../introspection/field-aliases.js";
import { compileFilter } from "./filter.js";
import { matchesSearch } from "./search.js";

export interface ExecutorOptions {
  maxResults: number;
  maxFieldSize: number;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ExecuteResult {
  result?: QueryResult;
  errors?: ValidationError[];
}

// ---------------------------------------------------------------------------
// Field resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a field name to an internal FeedItem key.
 * Accepts either native names (via alias) or internal names directly.
 */
function resolveToInternal(fieldName: string): string {
  return NATIVE_TO_INTERNAL.get(fieldName) ?? fieldName;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate the query. The select list accepts any field name — unknown native
 * fields are silently skipped during projection. Only sort direction and the
 * top limit are hard-validated here; sort field existence is validated only
 * for known internal/alias fields so that the executor can accept any
 * observed native field name without needing the ObservedFeedSchema.
 */
function validateQuery(
  query: FeedQuery,
  opts: ExecutorOptions,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (query.orderBy) {
    for (const clause of query.orderBy) {
      const parts = clause.trim().split(/\s+/);
      const fieldName = parts[0];
      const dir = (parts[1] ?? "asc").toLowerCase();
      const resolved = resolveToInternal(fieldName);
      // Only reject fields that are explicitly known to be non-sortable internal fields.
      // Unknown native fields are allowed through for best-effort comparison.
      const isKnownInternal = SORTABLE_FIELDS.has(fieldName);
      const isResolvable = resolved !== fieldName; // alias resolved successfully
      if (!isKnownInternal && !isResolvable && !SORTABLE_FIELDS.has(resolved)) {
        // Not a known sortable internal field and not a recognised alias —
        // allow it through; sort will use empty-string fallback for unknown fields.
      }
      if (dir !== "asc" && dir !== "desc") {
        errors.push({
          field: "orderBy",
          message: `Invalid sort direction '${dir}' for field '${fieldName}'. Use 'asc' or 'desc'.`,
        });
      }
    }
  }

  const top = query.top ?? opts.maxResults;
  if (top > opts.maxResults) {
    errors.push({
      field: "top",
      message: `Requested top=${top} exceeds server maximum of ${opts.maxResults}. Use skip/top to page.`,
    });
  }

  return errors;
}

/** Marker returned in query results when a field is too large to inline. */
const LARGE_FIELD_MARKER = {
  type: "large-field" as const,
  hint: "Use get_feed_item with this field in select[] to retrieve the full content.",
};

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

function projectItem(
  item: FeedItem,
  native: NativeItem,
  fields: string[],
  maxFieldSize: number,
): FeedItemRecord {
  const record: Record<string, unknown> = {};

  for (const f of fields) {
    const internalKey = resolveToInternal(f);
    const isLarge = LARGE_FIELDS.has(internalKey) || LARGE_FIELDS.has(f);

    // Large fields are never inlined — return a structured marker instead.
    if (isLarge) {
      record[f] = LARGE_FIELD_MARKER;
      continue;
    }

    // Prefer native item value when field exists there.
    if (f in native) {
      const val = native[f];
      record[f] = typeof val === "string" && val.length > maxFieldSize
        ? val.slice(0, maxFieldSize) + "…"
        : val;
      continue;
    }

    // Fall back to internal FeedItem field (direct or alias-resolved).
    const val = item[internalKey as keyof FeedItem];
    record[f] = typeof val === "string" && val.length > maxFieldSize
      ? val.slice(0, maxFieldSize) + "…"
      : val;
  }
  return record;
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

function sortItems(items: FeedItem[], orderBy: string[]): FeedItem[] {
  const sorted = [...items];
  // Apply in reverse so that the first clause has highest priority.
  for (const clause of [...orderBy].reverse()) {
    const parts = clause.trim().split(/\s+/);
    const rawField = parts[0];
    const field = resolveToInternal(rawField) as keyof FeedItem;
    const dir = (parts[1] ?? "asc").toLowerCase();
    sorted.sort((a, b) => {
      const av = (a[field] as string | null) ?? "";
      const bv = (b[field] as string | null) ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === "desc" ? -cmp : cmp;
    });
  }
  return sorted;
}

// ---------------------------------------------------------------------------
// Public execute function
// ---------------------------------------------------------------------------

export function executeQuery(
  items: FeedItem[],
  nativeItems: NativeItem[],
  query: FeedQuery,
  opts: ExecutorOptions,
): ExecuteResult {
  const errors = validateQuery(query, opts);
  if (errors.length > 0) return { errors };

  let candidates = [...items];
  // Keep native items aligned with candidates by index
  let nativeCandidates = [...nativeItems];

  // Apply structured filter
  if (query.filter?.trim()) {
    let compiledFilter;
    try {
      compiledFilter = compileFilter(query.filter);
    } catch (err) {
      return {
        errors: [
          {
            field: "filter",
            message: `Invalid filter expression: ${(err as Error).message}`,
          },
        ],
      };
    }
    const filteredPairs = candidates
      .map((item, i) => ({ item, native: nativeCandidates[i] ?? {} }))
      .filter(({ item }) => compiledFilter.test(item));
    candidates = filteredPairs.map((p) => p.item);
    nativeCandidates = filteredPairs.map((p) => p.native);
  }

  // Apply full-text search
  if (query.search?.trim()) {
    const filteredPairs = candidates
      .map((item, i) => ({ item, native: nativeCandidates[i] ?? {} }))
      .filter(({ item }) => matchesSearch(item, query.search!));
    candidates = filteredPairs.map((p) => p.item);
    nativeCandidates = filteredPairs.map((p) => p.native);
  }

  // Sort
  if (query.orderBy?.length) {
    const sorted = sortItems(candidates, query.orderBy);
    // Re-align native items to match new order
    const idToNative = new Map(candidates.map((item, i) => [item.id, nativeCandidates[i] ?? {}]));
    candidates = sorted;
    nativeCandidates = sorted.map((item) => idToNative.get(item.id) ?? {});
  }

  const totalMatched = candidates.length;
  const skip = query.skip ?? 0;
  const top = Math.min(query.top ?? opts.maxResults, opts.maxResults);

  const pagePairs = candidates
    .map((item, i) => ({ item, native: nativeCandidates[i] ?? {} }))
    .slice(skip, skip + top);

  // Determine projection fields. Large fields are always included in the list
  // but projectItem will replace their value with a LARGE_FIELD_MARKER.
  const projectionFields = query.select ?? (DEFAULT_SELECT as string[]);

  const projected = pagePairs.map(({ item, native }) =>
    projectItem(item, native, projectionFields, opts.maxFieldSize),
  );

  return {
    result: {
      items: projected,
      totalMatched,
      returned: projected.length,
      skip,
      top,
    },
  };
}
