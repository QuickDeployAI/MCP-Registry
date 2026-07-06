/**
 * Query executor.
 *
 * Takes a FeedQuery, applies filters/search/sort/pagination, then projects
 * the requested fields from the raw feedsmith items (augmented with `_id`
 * and `_fetchedAt`). Works on any Record<string,unknown> item shape.
 *
 * Large fields — any string value longer than LARGE_FIELD_THRESHOLD — are
 * replaced with a marker object in query results. Use get_feed_item to
 * retrieve them.
 */
import { LARGE_FIELD_THRESHOLD } from "../schema.js";
import type { FeedItemRecord, FeedQuery, QueryResult } from "../types.js";
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
// Validation
// ---------------------------------------------------------------------------

function validateQuery(query: FeedQuery, opts: ExecutorOptions): ValidationError[] {
  const errors: ValidationError[] = [];
  if (query.orderBy) {
    for (const clause of query.orderBy) {
      const parts = clause.trim().split(/\s+/);
      const dir = (parts[1] ?? "asc").toLowerCase();
      if (dir !== "asc" && dir !== "desc") {
        errors.push({
          field: "orderBy",
          message: `Invalid sort direction '${dir}' for field '${parts[0]}'. Use 'asc' or 'desc'.`,
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

/** Marker returned in results when a field value is too large to inline. */
const LARGE_FIELD_MARKER = {
  type: "large-field" as const,
  hint: "Use get_feed_item with this field in select[] to retrieve the full content.",
};

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

function projectItem(
  item: Record<string, unknown>,
  fields: string[],
  maxFieldSize: number,
): FeedItemRecord {
  const record: Record<string, unknown> = {};
  for (const f of fields) {
    const val = item[f];
    if (typeof val === "string" && val.length > LARGE_FIELD_THRESHOLD) {
      record[f] = LARGE_FIELD_MARKER;
    } else if (typeof val === "string" && val.length > maxFieldSize) {
      record[f] = val.slice(0, maxFieldSize) + "…";
    } else {
      record[f] = val;
    }
  }
  return record;
}

// ---------------------------------------------------------------------------
// Default field selection
// ---------------------------------------------------------------------------

/**
 * When no select is given, return all fields present on the item that are not
 * large strings or deeply nested plain objects. This is fully dynamic — no fixed field list.
 * Arrays (e.g. categories, authors) are included.
 */
function defaultFields(item: Record<string, unknown>): string[] {
  const fields = new Set<string>();
  for (const [k, v] of Object.entries(item)) {
    // Always include metadata fields
    if (k.startsWith("_")) { fields.add(k); continue; }
    // Include arrays, scalars, and null; exclude plain nested objects and large strings
    if (
      v === null
      || Array.isArray(v)
      || (typeof v !== "object" && (typeof v !== "string" || v.length <= LARGE_FIELD_THRESHOLD))
    ) {
      fields.add(k);
    }
  }
  return [...fields];
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

function sortItems(items: Record<string, unknown>[], orderBy: string[]): Record<string, unknown>[] {
  const sorted = [...items];
  for (const clause of [...orderBy].reverse()) {
    const parts = clause.trim().split(/\s+/);
    const field = parts[0];
    const dir = (parts[1] ?? "asc").toLowerCase();
    sorted.sort((a, b) => {
      const av = String(a[field] ?? "");
      const bv = String(b[field] ?? "");
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
  items: Record<string, unknown>[],
  query: FeedQuery,
  opts: ExecutorOptions,
): ExecuteResult {
  const errors = validateQuery(query, opts);
  if (errors.length > 0) return { errors };

  let candidates = [...items];

  if (query.filter?.trim()) {
    let compiledFilter;
    try {
      compiledFilter = compileFilter(query.filter);
    } catch (err) {
      return { errors: [{ field: "filter", message: `Invalid filter expression: ${(err as Error).message}` }] };
    }
    candidates = candidates.filter((item) => compiledFilter.test(item));
  }

  if (query.search?.trim()) {
    candidates = candidates.filter((item) => matchesSearch(item, query.search!));
  }

  if (query.orderBy?.length) {
    candidates = sortItems(candidates, query.orderBy);
  }

  const totalMatched = candidates.length;
  const skip = query.skip ?? 0;
  const top = Math.min(query.top ?? opts.maxResults, opts.maxResults);
  const page = candidates.slice(skip, skip + top);

  const projectionFields = query.select ?? (page.length > 0 ? defaultFields(page[0]) : ["_id"]);
  const projected = page.map((item) => projectItem(item, projectionFields, opts.maxFieldSize));

  return {
    result: { items: projected, totalMatched, returned: projected.length, skip, top },
  };
}
