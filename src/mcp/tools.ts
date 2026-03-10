/**
 * MCP tool registrations.
 * Each tool is a thin adapter that resolves feedUrl, invokes a use case,
 * and serialises the result as a JSON text content block.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StoreAdapter } from "../store/adapter.js";
import type { ContentStore } from "../content/content-store.js";
import type { FetcherFn, ParserFn, NormalizerFn } from "../polling/coordinator.js";
import { QueryFeedItemsUseCase } from "../application/query-feed-items.use-case.js";
import { RefreshFeedUseCase } from "../application/refresh-feed.use-case.js";
import { GetFeedInfoUseCase } from "../application/get-feed-info.use-case.js";
import { GetFeedItemUseCase } from "../application/get-feed-item.use-case.js";
import { GetFeedStatsUseCase } from "../application/get-feed-stats.use-case.js";
import { GetSchemaUseCase } from "../application/get-schema.use-case.js";
import { GetFieldAliasesUseCase } from "../application/get-field-aliases.use-case.js";
import { GetQueryExamplesUseCase } from "../application/get-query-examples.use-case.js";
import {
  GetFeedInfoSchema,
  RefreshFeedSchema,
  GetSchemaSchema,
  GetFieldAliasesSchema,
  QueryFeedItemsSchema,
  GetFeedItemSchema,
  GetQueryExamplesSchema,
  GetFeedStatsSchema,
  GetRecentItemsSchema,
  GetNewItemsSinceSchema,
} from "./schemas.js";

export interface ToolDeps {
  store: StoreAdapter;
  contentStore: ContentStore;
  fetcher: FetcherFn;
  parser: ParserFn;
  normalizer: NormalizerFn;
  defaultFeed: string | null;
  maxResults: number;
  maxFieldSize: number;
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function resolveFeed(feedUrl: string | undefined, defaultFeed: string | null): string | null {
  return feedUrl ?? defaultFeed;
}

function missingFeedError() {
  return ok({
    error: "No feed specified",
    reason: "feedUrl was not provided and no defaultFeed is configured.",
    suggestion: "Pass feedUrl in the tool call or start the server with --feed=<url>.",
  });
}

export function registerTools(server: McpServer, deps: ToolDeps): void {
  const {
    store, contentStore, fetcher, parser, normalizer,
    defaultFeed, maxResults, maxFieldSize,
  } = deps;

  server.tool(
    "get_schema",
    "Returns the observed, feed-specific schema derived from the actual fields present in that feed's items — including namespaced extensions like dc:creator, media:content, itunes:duration, etc.",
    GetSchemaSchema.shape,
    async ({ feedUrl }) => {
      const url = resolveFeed(feedUrl, defaultFeed);
      if (!url) return missingFeedError();
      return ok(await new GetSchemaUseCase(store).execute(url));
    },
  );

  server.tool(
    "get_field_aliases",
    "Returns the alias registry mapping native feed field names (e.g. pubDate, dc:creator) to internal FeedItem field names (e.g. publishedAt, author).",
    GetFieldAliasesSchema.shape,
    async () => ok(new GetFieldAliasesUseCase().execute()),
  );

  server.tool(
    "get_query_examples",
    "Returns at least 10 realistic query examples with descriptions to help you construct effective queries.",
    GetQueryExamplesSchema.shape,
    async () => ok(new GetQueryExamplesUseCase().execute()),
  );

  server.tool(
    "get_feed_info",
    "Returns feed metadata: title, description, item count, last refresh time, and polling status.",
    GetFeedInfoSchema.shape,
    async ({ feedUrl }) => {
      const url = resolveFeed(feedUrl, defaultFeed);
      if (!url) return missingFeedError();
      return ok(await new GetFeedInfoUseCase(store).execute(url));
    },
  );

  server.tool(
    "refresh_feed",
    "Fetches the feed from its source URL and ingests new items. Returns the count of new items added.",
    RefreshFeedSchema.shape,
    async ({ feedUrl }) => {
      const url = resolveFeed(feedUrl, defaultFeed);
      if (!url) return missingFeedError();
      return ok(await new RefreshFeedUseCase(store, fetcher, parser, normalizer).execute(url));
    },
  );

  server.tool(
    "query_feed_items",
    "Query feed items with optional filter (RSQL), full-text search, sorting, and pagination. Large fields (contentText/contentHtml) are excluded by default.",
    QueryFeedItemsSchema.shape,
    async ({ feedUrl, select, filter, search, orderBy, top, skip }) => {
      const url = resolveFeed(feedUrl, defaultFeed);
      if (!url) return missingFeedError();
      const useCase = new QueryFeedItemsUseCase(store, { maxResults, maxFieldSize });
      return ok(await useCase.execute(url, { select, filter, search, orderBy, top, skip }));
    },
  );

  server.tool(
    "get_feed_item",
    "Retrieve a single item by ID with optional field projection. Large fields are returned as ContentRef objects (use the rss2mcp://content resource to read them).",
    GetFeedItemSchema.shape,
    async ({ feedUrl, id, select }) => {
      const url = resolveFeed(feedUrl, defaultFeed);
      if (!url) return missingFeedError();
      return ok(await new GetFeedItemUseCase(store, contentStore).execute(url, id, select));
    },
  );

  server.tool(
    "get_feed_stats",
    "Returns aggregate statistics for a feed: item count, date range, author count, category count, and how many items have full content.",
    GetFeedStatsSchema.shape,
    async ({ feedUrl }) => {
      const url = resolveFeed(feedUrl, defaultFeed);
      if (!url) return missingFeedError();
      return ok(await new GetFeedStatsUseCase(store).execute(url));
    },
  );

  server.tool(
    "get_recent_items",
    "Shorthand for querying the most recent N items sorted by publishedAt descending.",
    GetRecentItemsSchema.shape,
    async ({ feedUrl, limit }) => {
      const url = resolveFeed(feedUrl, defaultFeed);
      if (!url) return missingFeedError();
      const useCase = new QueryFeedItemsUseCase(store, { maxResults, maxFieldSize });
      return ok(await useCase.execute(url, { orderBy: ["publishedAt desc"], top: limit ?? 10 }));
    },
  );

  server.tool(
    "get_new_items_since",
    "Returns items published at or after the given ISO-8601 timestamp.",
    GetNewItemsSinceSchema.shape,
    async ({ feedUrl, since }) => {
      const url = resolveFeed(feedUrl, defaultFeed);
      if (!url) return missingFeedError();
      const useCase = new QueryFeedItemsUseCase(store, { maxResults, maxFieldSize });
      return ok(await useCase.execute(url, {
        filter: `publishedAt=ge=${since}`,
        orderBy: ["publishedAt desc"],
      }));
    },
  );
}
