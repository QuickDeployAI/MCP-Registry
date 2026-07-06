export function workspacePackageKinds(): readonly string[] {
  return ["core", "mcp-importers", "mcps", "tools"] as const;
}
