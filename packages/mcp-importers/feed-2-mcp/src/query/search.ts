/**
 * Full-text search over feed item string fields.
 *
 * Searches all top-level string values in the item — no fixed schema required.
 *
 * Supports:
 *   - plain terms (AND logic)
 *   - quoted phrases "model context protocol"
 *   - OR grouping:  MCP OR agent
 *   - negation:     -unwanted
 */

interface SearchToken {
  type: "phrase" | "term" | "or" | "not";
  value: string;
}

function tokenizeSearch(query: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  let i = 0;
  while (i < query.length) {
    if (/\s/.test(query[i])) { i++; continue; }

    // Quoted phrase
    if (query[i] === '"') {
      i++;
      let phrase = "";
      while (i < query.length && query[i] !== '"') phrase += query[i++];
      i++; // closing quote
      tokens.push({ type: "phrase", value: phrase.toLowerCase() });
      continue;
    }

    // Read a word
    let word = "";
    const neg = query[i] === "-";
    if (neg) i++;
    while (i < query.length && !/\s/.test(query[i])) word += query[i++];
    if (!word) continue;

    if (word.toUpperCase() === "OR") {
      tokens.push({ type: "or", value: "OR" });
    } else if (neg) {
      tokens.push({ type: "not", value: word.toLowerCase() });
    } else {
      tokens.push({ type: "term", value: word.toLowerCase() });
    }
  }
  return tokens;
}

function getSearchableText(item: Record<string, unknown>): string {
  return Object.values(item)
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toLowerCase();
}

export function matchesSearch(item: Record<string, unknown>, query: string): boolean {
  const text = getSearchableText(item);
  const tokens = tokenizeSearch(query);
  if (tokens.length === 0) return true;

  // Evaluate left-to-right: implicit AND between non-OR-separated groups,
  // OR token separates two sides.
  let groups: SearchToken[][] = [[]];
  for (const token of tokens) {
    if (token.type === "or") {
      groups.push([]);
    } else {
      groups[groups.length - 1].push(token);
    }
  }

  // An OR group matches if ALL its tokens match (AND logic within group)
  return groups.some((group) =>
    group.every((token) => {
      if (token.type === "not") return !text.includes(token.value);
      if (token.type === "phrase") return text.includes(token.value);
      return text.includes(token.value);
    }),
  );
}
