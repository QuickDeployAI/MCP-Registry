import { z } from "zod";

const corpusIdField = z
  .string()
  .optional()
  .describe("Corpus id to query. Defaults to the corpus loaded at startup.");

export const RefreshCorpusSchema = z.object({
  corpusId: corpusIdField,
});

export const SearchCorpusSchema = z.object({
  corpusId: corpusIdField,
  search: z.string().optional().describe("Full-text search expression (terms, \"phrases\", OR, -negation)."),
  filter: z.string().optional().describe("RSQL filter expression, e.g. wikiPath=contains=guides"),
  orderBy: z.array(z.string()).optional().describe("Sort clauses, e.g. [\"title asc\"]."),
  top: z.number().int().positive().optional(),
  skip: z.number().int().nonnegative().optional(),
});

export const GetDocSchema = z.object({
  corpusId: corpusIdField,
  id: z.string().describe("Chunk _id returned by search."),
});

export const ListSourcesSchema = z.object({
  corpusId: corpusIdField,
});
