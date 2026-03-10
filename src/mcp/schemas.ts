/**
 * Zod input schemas for all MCP tool definitions.
 * Centralising these prevents duplication across tool handlers.
 */
import { z } from "zod";

const feedUrlParam = z
  .string()
  .optional()
  .describe(
    "Feed URL (http/https), file:// URI, or local filesystem path. Omit to use the server's defaultFeed.",
  );

export const GetFeedInfoSchema = z.object({
  feedUrl: feedUrlParam,
});

export const RefreshFeedSchema = z.object({
  feedUrl: feedUrlParam,
});

export const GetSchemaSchema = z.object({
  feedUrl: feedUrlParam,
});

export const GetFieldAliasesSchema = z.object({});

export const QueryFeedItemsSchema = z.object({
  feedUrl: feedUrlParam,
  select: z
    .array(z.string())
    .optional()
    .describe("Fields to return. Omit for the default compact set."),
  filter: z
    .string()
    .optional()
    .describe("RSQL filter expression, e.g. title=like=*AI*;publishedAt=gt=2024-01-01T00:00:00Z"),
  search: z
    .string()
    .optional()
    .describe("Full-text search query. Supports phrases, OR, NOT (-term)."),
  orderBy: z
    .array(z.string())
    .optional()
    .describe("Sort clauses, e.g. [\"publishedAt desc\", \"title asc\"]."),
  top: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Maximum number of results to return."),
  skip: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of results to skip for pagination."),
});

export const GetFeedItemSchema = z.object({
  feedUrl: feedUrlParam,
  id: z.string().describe("Item ID (from id field in query results)."),
  select: z
    .array(z.string())
    .optional()
    .describe("Fields to return. Large fields (contentText/contentHtml) will be returned as ContentRef objects."),
});

export const GetQueryExamplesSchema = z.object({});

export const GetFeedStatsSchema = z.object({
  feedUrl: feedUrlParam,
});

export const GetRecentItemsSchema = z.object({
  feedUrl: feedUrlParam,
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .describe("Number of recent items to return (default: 10)."),
});

export const GetNewItemsSinceSchema = z.object({
  feedUrl: feedUrlParam,
  since: z
    .string()
    .describe("ISO-8601 timestamp. Returns items with publishedAt >= this value."),
});
