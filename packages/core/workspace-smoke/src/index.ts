export function workspacePackageKinds(): readonly string[] {
  return ["core", "importers", "runtime", "schemas", "tools"] as const;
}
