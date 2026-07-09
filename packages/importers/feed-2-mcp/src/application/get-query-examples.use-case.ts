/**
 * Use case: return example queries demonstrating available capabilities.
 */

export interface QueryExample {
  description: string;
  query: Record<string, unknown>;
}

const EXAMPLES: QueryExample[] = [
  {
    description: "Most recent 10 items (default fields)",
    query: { orderBy: ["publishedAt desc"], top: 10 },
  },
  {
    description: "Items with 'AI' in the title",
    query: { filter: "title=like=*AI*", orderBy: ["publishedAt desc"] },
  },
  {
    description: "Full-text search for 'machine learning'",
    query: { search: "machine learning", top: 20 },
  },
  {
    description: "Items published after a specific date",
    query: { filter: "publishedAt=gt=2024-01-01T00:00:00Z", orderBy: ["publishedAt desc"] },
  },
  {
    description: "Items by a specific author",
    query: { filter: 'author=="Jane Doe"', select: ["id", "title", "publishedAt", "link"] },
  },
  {
    description: "Items in a specific category",
    query: { filter: "categories=contains=Technology", orderBy: ["publishedAt desc"] },
  },
  {
    description: "Items with full content available",
    query: { filter: "hasFullContent==true", top: 10 },
  },
  {
    description: "Search with OR logic and select specific fields",
    query: {
      search: "OpenAI OR Anthropic",
      select: ["id", "title", "publishedAt", "author", "summary"],
      orderBy: ["publishedAt desc"],
      top: 15,
    },
  },
  {
    description: "Page through results (second page of 20)",
    query: { orderBy: ["publishedAt desc"], top: 20, skip: 20 },
  },
  {
    description: "Items with 'security' in title or summary, not older than 7 days",
    query: {
      search: "security vulnerability",
      filter: "publishedAt=ge=2024-01-01T00:00:00Z",
      orderBy: ["publishedAt desc"],
      top: 10,
    },
  },
  {
    description: "Items sorted by title alphabetically",
    query: { orderBy: ["title asc"], top: 25 },
  },
  {
    description: "Filter by multiple conditions (AND): specific author AND category",
    query: {
      filter: 'author=="John Smith";categories=contains=News',
      orderBy: ["publishedAt desc"],
    },
  },
];

export class GetQueryExamplesUseCase {
  execute(): QueryExample[] {
    return EXAMPLES;
  }
}
