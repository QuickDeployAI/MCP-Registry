export function buildUrl(
  baseUrl: string,
  path: string,
  args: Record<string, unknown>,
  pathParams: readonly string[],
  bodyKeys: readonly string[],
): URL {
  const resolved = path.replace(
    /\{([^}]+)\}/g,
    (_, k: string) => encodeURIComponent(String(args[k] ?? "")),
  );
  const url = new URL(baseUrl + resolved);
  for (const [k, v] of Object.entries(args)) {
    if (!pathParams.includes(k) && !bodyKeys.includes(k) && v != null) {
      url.searchParams.set(k, String(v));
    }
  }
  return url;
}

export function buildBody(bodyKeys: readonly string[], args: Record<string, unknown>): unknown {
  if (bodyKeys.length === 0) return undefined;
  if (bodyKeys.length === 1 && bodyKeys[0] === "body") return args.body;
  return Object.fromEntries(bodyKeys.filter((k) => args[k] != null).map((k) => [k, args[k]]));
}
