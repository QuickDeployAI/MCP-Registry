import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { McpManifestSchema, type McpManifest } from "@quickdeployai/registry-schemas/mcp-manifest";
import { parse as parseYaml } from "yaml";

export async function loadManifestFile(path: string): Promise<McpManifest> {
  const raw = await readStructuredFile(path);
  return McpManifestSchema.parse(raw);
}

export async function loadUserConfigFile(
  path: string | undefined,
): Promise<Record<string, unknown>> {
  if (!path) return {};
  const raw = await readStructuredFile(path);
  if (!isRecord(raw)) {
    throw new Error(`Config file ${path} must contain an object.`);
  }
  return raw;
}

async function readStructuredFile(path: string): Promise<unknown> {
  const text = await readFile(path, "utf8");
  if (path.endsWith(".json")) return JSON.parse(text);

  const ext = extname(path).toLowerCase();
  if (ext === ".yaml" || ext === ".yml") return parseYaml(text);

  try {
    return JSON.parse(text);
  } catch {
    return parseYaml(text);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
