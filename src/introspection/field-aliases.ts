/**
 * Canonical alias registry: mappings from native feed field names to
 * internal FeedItem field names.
 */

export interface FieldAlias {
  /** Native field name (as in the feed). */
  native: string;
  /** Internal FeedItem field name. */
  internal: string;
  /** Human-friendly description. */
  description: string;
}

/** Registry covering RSS 2.0, Atom, and common extensions. */
export const FIELD_ALIASES: FieldAlias[] = [
  { native: "pubDate",         internal: "publishedAt", description: "RSS 2.0 publication date" },
  { native: "updated",         internal: "updatedAt",   description: "Atom last-updated date" },
  { native: "dc:creator",      internal: "author",      description: "Dublin Core creator" },
  { native: "author",          internal: "author",      description: "RSS 2.0 / Atom author" },
  { native: "description",     internal: "summary",     description: "RSS 2.0 item description" },
  { native: "summary",         internal: "summary",     description: "Atom summary" },
  { native: "content:encoded", internal: "contentHtml", description: "RSS content:encoded extension" },
  { native: "content",         internal: "contentHtml", description: "Atom content element" },
];

/** Map: native name → internal FeedItem field name */
export const NATIVE_TO_INTERNAL: ReadonlyMap<string, string> = new Map(
  FIELD_ALIASES.map((a) => [a.native, a.internal]),
);

/** Map: internal field name → list of native names */
export const INTERNAL_TO_NATIVES: ReadonlyMap<string, string[]> = FIELD_ALIASES.reduce(
  (acc, alias) => {
    const existing = acc.get(alias.internal) ?? [];
    acc.set(alias.internal, [...existing, alias.native]);
    return acc;
  },
  new Map<string, string[]>(),
);
