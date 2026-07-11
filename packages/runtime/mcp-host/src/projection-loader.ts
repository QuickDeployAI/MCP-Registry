import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { ArdEntrySchema, type ArdEntry } from "@quickdeployai/registry-schemas/ard";
import {
  McpProjectionConfigSchema,
  type McpProjectionConfig,
} from "@quickdeployai/registry-schemas/mcp-projection";
import { parse as parseYaml } from "yaml";

export type ProjectedEntry = {
  entry: ArdEntry;
  projection: McpProjectionConfig;
};

export async function loadProjectedEntry(
  entryPath: string,
  projectionPath = entryPath.replace(/\.ard\.(json|ya?ml)$/i, ".projection.$1"),
): Promise<ProjectedEntry> {
  const entry = ArdEntrySchema.parse(await readStructuredFile(entryPath));
  const projection = McpProjectionConfigSchema.parse(await readStructuredFile(projectionPath));
  if (projection.entryRef !== entry.identifier) {
    throw new Error(
      `Projection ${projectionPath} references ${projection.entryRef}, not ${entry.identifier}.`,
    );
  }
  return { entry, projection };
}

export async function loadUserConfigFile(
  path: string | undefined,
): Promise<Record<string, unknown>> {
  if (!path) return {};
  const raw = await readStructuredFile(path);
  if (!isRecord(raw)) throw new Error(`Config file ${path} must contain an object.`);
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
