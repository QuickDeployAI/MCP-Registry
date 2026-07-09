export type {
  FeedInfo,
  FeedItemRecord,
  FeedQuery,
  FieldMeta,
  NativeItem,
  ObservedFeedSchema,
  ObservedFieldSchema,
  QueryResult,
} from "@quickdeployai/corpus-core";

/** Structured error returned from tools. */
export interface ToolError {
  error: string;
  reason: string;
  suggestion?: string;
}
