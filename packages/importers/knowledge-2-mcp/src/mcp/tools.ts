/**
 * MCP tool registrations.
 */
import { ok, toolError } from "@quickdeployai/importer-core";
import type { StoreAdapter } from "@quickdeployai/corpus-core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DocChunk } from "../types.js";
import { RefreshCorpusUseCase } from "../application/refresh-corpus.use-case.js";
import { SearchCorpusUseCase } from "../application/search-corpus.use-case.js";
import { GetDocUseCase } from "../application/get-doc.use-case.js";
import { ListSourcesUseCase } from "../application/list-sources.use-case.js";
import {
  RefreshCorpusSchema,
  SearchCorpusSchema,
  GetDocSchema,
  ListSourcesSchema,
} from "./schemas.js";

export interface ToolDeps {
  store: StoreAdapter<DocChunk>;
  defaultCorpusId: string | null;
  defaultSourceDir: string | null;
  sourceType: "markdown" | "openwiki";
  maxResults: number;
  maxFieldSize: number;
}

function resolveCorpus(corpusId: string | undefined, defaultCorpusId: string | null): string | null {
  return corpusId ?? defaultCorpusId;
}

function missingCorpusError() {
  return toolError("No corpus specified", {
    reason: "corpusId was not provided and no default corpus is configured.",
    suggestion: "Pass corpusId in the tool call or start the server with --source=<dir>.",
  });
}

export function registerTools(server: McpServer, deps: ToolDeps): void {
  const { store, defaultCorpusId, defaultSourceDir, sourceType, maxResults, maxFieldSize } = deps;

  server.tool(
    "refresh",
    "(Re-)ingest the corpus source directory. Run this after the on-disk tree changes (e.g. after re-running OpenWiki) to pick up new or edited pages.",
    RefreshCorpusSchema.shape,
    async ({ corpusId }) => {
      const id = resolveCorpus(corpusId, defaultCorpusId);
      if (!id) return missingCorpusError();
      if (!defaultSourceDir) {
        return toolError("No source directory configured", {
          reason: "The server was started without --source=<dir>.",
          suggestion: "Restart with --source pointing at the corpus directory.",
        });
      }
      const useCase = new RefreshCorpusUseCase(store);
      return ok(await useCase.execute({ corpusId: id, sourceDir: defaultSourceDir, sourceType }));
    },
  );

  server.tool(
    "search",
    "Search the corpus (full-text + optional RSQL filter/sort) and return ranked hits with page-level citations (breadcrumb + heading) and a snippet.",
    SearchCorpusSchema.shape,
    async ({ corpusId, search, filter, orderBy, top, skip }) => {
      const id = resolveCorpus(corpusId, defaultCorpusId);
      if (!id) return missingCorpusError();
      const useCase = new SearchCorpusUseCase(store, { maxResults, maxFieldSize });
      return ok(await useCase.execute(id, { search, filter, orderBy, top, skip }));
    },
  );

  server.tool(
    "get_doc",
    "Retrieve a chunk's full, untruncated content and citation by the _id returned from search.",
    GetDocSchema.shape,
    async ({ corpusId, id }) => {
      const cid = resolveCorpus(corpusId, defaultCorpusId);
      if (!cid) return missingCorpusError();
      return ok(await new GetDocUseCase(store).execute(cid, id));
    },
  );

  server.tool(
    "list_sources",
    "Summarize the ingested corpus: chunk/page counts, discovered top-level wiki sections, and last refresh status.",
    ListSourcesSchema.shape,
    async ({ corpusId }) => {
      const id = resolveCorpus(corpusId, defaultCorpusId);
      if (!id) return missingCorpusError();
      return ok(await new ListSourcesUseCase(store).execute(id));
    },
  );
}
