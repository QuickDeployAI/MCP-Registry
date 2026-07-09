/**
 * MCP tool registrations.
 */
import { ok, toolError } from "@quickdeployai/importer-core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NativeItem } from "../types.js";
import type { StoreAdapter } from "../store/adapter.js";
import type { ContentStore } from "../content/content-store.js";
import type { FetcherFn, ParserFn } from "../polling/coordinator.js";
import { QueryFeedItemsUseCase } from "../application/query-feed-items.use-case.js";
import { RefreshFeedUseCase } from "../application/refresh-feed.use-case.js";
import { GetFeedInfoUseCase } from "../application/get-feed-info.use-case.js";
import { GetFeedItemUseCase } from "../application/get-feed-item.use-case.js";
import { GetFeedStatsUseCase } from "../application/get-feed-stats.use-case.js";
import { GetSchemaUseCase } from "../application/get-schema.use-case.js";
import { GetQueryExamplesUseCase } from "../application/get-query-examples.use-case.js";
import {
  GetFeedInfoSchema,
  RefreshFeedSchema,
  GetSchemaSchema,
  QueryFeedItemsSchema,
  GetFeedItemSchema,
  GetQueryExamplesSchema,
  GetFeedStatsSchema,
  GetRecentItemsSchema,
  GetNewItemsSinceSchema,
} from "./schemas.js";

export interface ToolDeps<TItem extends NativeItem = NativeItem> {
  store: StoreAdapter<TItem>;
  contentStore: ContentStore;
  fetcher: FetcherFn;
  parser: ParserFn;
  defaultFeed: string | null;
  maxResults: number;
  maxFieldSize: number;
}

function resolveFeed(feedUrl: string | undefined, defaultFeed: string | null): string | null {
  return feedUrl ?? defaultFeed;
}

function missingFeedError() {
  return toolError("No feed specified", {
    reason: "feedUrl was not provided and no defaultFeed is configured.",
    suggestion: "Pass feedUrl in the tool call or start the server with --feed=<url>.",
  });
}

export function registerTools<TItem extends NativeItem = NativeItem>(
  server: McpServer,
  deps: ToolDeps<TItem>,
): void {
  const { store, contentStore, fetcher, parser, defaultFeed, maxResults, maxFieldSize } = deps;

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
      return ok(await new RefreshFeedUseCase(store, fetcher, parser).execute(url));
    },
  );

  server.tool(
    "query_feed_items",
    "Query feed items with optional filter (RSQL), full-text search, sorting, and pagination.",
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
    "Retrieve a single item by its _id with optional field projection. Large string fields are returned as ContentRef objects.",
    GetFeedItemSchema.shape,
    async ({ feedUrl, id, select }) => {
      const url = resolveFeed(feedUrl, defaultFeed);
      if (!url) return missingFeedError();
      return ok(await new GetFeedItemUseCase(store, contentStore).execute(url, id, select));
    },
  );

  server.tool(
    "get_feed_stats",
    "Returns aggregate statistics for a feed: item count and the ingestion timestamp range (oldest and newest _fetchedAt).",
    GetFeedStatsSchema.shape,
    async ({ feedUrl }) => {
      const url = resolveFeed(feedUrl, defaultFeed);
      if (!url) return missingFeedError();
      return ok(await new GetFeedStatsUseCase(store).execute(url));
    },
  );

  server.tool(
    "get_recent_items",
    "Shorthand for querying the most recent N items sorted by ingestion time descending.",
    GetRecentItemsSchema.shape,
    async ({ feedUrl, limit }) => {
      const url = resolveFeed(feedUrl, defaultFeed);
      if (!url) return missingFeedError();
      const useCase = new QueryFeedItemsUseCase(store, { maxResults, maxFieldSize });
      // Sort by _fetchedAt (ingestion metadata, always present) so the tool works
      // regardless of which date field name the feed format uses.
      return ok(await useCase.execute(url, {
        orderBy: ["_fetchedAt desc"],
        top: limit ?? 10,
      }));
    },
  );

  server.tool(
    "get_new_items_since",
    "Returns items ingested at or after the given ISO-8601 timestamp (based on ingestion time).",
    GetNewItemsSinceSchema.shape,
    async ({ feedUrl, since }) => {
      const url = resolveFeed(feedUrl, defaultFeed);
      if (!url) return missingFeedError();
      const useCase = new QueryFeedItemsUseCase(store, { maxResults, maxFieldSize });
      // Filter on _fetchedAt (ingestion metadata, always present) to avoid assuming
      // a specific date field name (pubDate vs published vs date_published, etc.).
      return ok(await useCase.execute(url, {
        filter: `_fetchedAt=ge=${since}`,
        orderBy: ["_fetchedAt desc"],
      }));
    },
  );
}
