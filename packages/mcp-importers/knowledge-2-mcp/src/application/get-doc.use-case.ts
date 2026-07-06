/**
 * Use case: retrieve a single chunk by `_id` with its full, untruncated
 * content and citation metadata.
 */
import type { StoreAdapter } from "@quickdeployai/corpus-core";
import type { DocChunk, ToolError } from "../types.js";

export interface DocResult {
  id: string;
  path: string;
  breadcrumb: string;
  title: string;
  heading: string;
  headingTrail: string[];
  citation: string;
  content: string;
  tags: string[];
}

export class GetDocUseCase {
  constructor(private readonly store: StoreAdapter<DocChunk>) {}

  async execute(corpusId: string, id: string): Promise<DocResult | ToolError> {
    const item = await this.store.getItem(corpusId, id);
    if (!item) {
      return { error: "Chunk not found", reason: `No chunk with id=${id} in corpus ${corpusId}` };
    }

    const citation = item.heading ? `${item.breadcrumb} > ${item.heading}` : item.breadcrumb;
    return {
      id,
      path: item.path,
      breadcrumb: item.breadcrumb,
      title: item.title,
      heading: item.heading,
      headingTrail: item.headingTrail,
      citation,
      content: item.content,
      tags: item.tags,
    };
  }
}
