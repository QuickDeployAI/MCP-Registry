import { access, readdir, readFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { McpManifestSchema, validateMcpManifestImporterConfig } from "@quickdeployai/registry-schemas";
import { buildRegistryArtifacts, checkGeneratedRegistryArtifacts } from "../registry-build";
import { validateRegistryEntries } from "../registry-validate";
import {
  GENERATED_MCP_POLICY_META_KEY,
  GENERATED_MCP_SOURCE_META_KEY,
} from "./manifest-generator";
import {
  GENERATED_MCP_CODEGEN_ROOT,
  generatedMcpWorkspacePaths,
  importerEngineForFamily,
  type GeneratedMcpFamily,
} from "./workspace-conventions";

export type GeneratedMcpReadinessViolationCode =
  | "registry-validation-failed"
  | "generated-artifacts-stale"
  | "missing-generated-test"
  | "catalog-includes-generated-artifact"
  | "tracked-generated-artifact"
  | "sandbox-bypass";

export type GeneratedMcpReadinessViolation = {
  readonly code: GeneratedMcpReadinessViolationCode;
  readonly message: string;
  readonly provider?: string;
  readonly family?: GeneratedMcpFamily;
  readonly manifestPath?: string;
  readonly generatedTestPath?: string;
  readonly codegenPath?: string;
};

export type GeneratedMcpReadinessEntry = {
  readonly provider: string;
  readonly family: GeneratedMcpFamily;
  readonly manifestPath: string;
  readonly generatedTestPath: string;
  readonly codegenPath: string;
};

export type GeneratedMcpReadinessResult = {
  readonly ok: boolean;
  readonly entries: readonly GeneratedMcpReadinessEntry[];
  readonly violations: readonly GeneratedMcpReadinessViolation[];
};

export type ValidateGeneratedMcpReadinessOptions = {
  readonly rootDir: string;
  readonly trackedFiles?: readonly string[];
};

const DIRECT_HOST_EXECUTION_TERMS = [
  ["node:", "child_", "process"],
  ["node:", "vm"],
  ["ex", "ec"],
  ["ex", "ec", "File"],
  ["sp", "awn"],
  ["fo", "rk"],
  ["ts", "x"],
] as const;

export async function validateGeneratedMcpReadiness(
  options: ValidateGeneratedMcpReadinessOptions,
): Promise<GeneratedMcpReadinessResult> {
  const rootDir = resolve(options.rootDir);
  const violations: GeneratedMcpReadinessViolation[] = [];
  const entries = await discoverGeneratedMcpEntries(rootDir, violations);

  const registry = await validateRegistryEntries({ rootDir });
  for (const violation of registry.violations) {
    violations.push({
      code: "registry-validation-failed",
      message: `[${violation.code}] ${violation.message}`,
      manifestPath: violation.path,
      ...entryFieldsForPath(entries, violation.path),
    });
  }

  const generatedArtifacts = await checkGeneratedRegistryArtifacts({ rootDir });
  for (const changed of generatedArtifacts.changed) {
    pushContextualViolation(violations, entries, {
      code: "generated-artifacts-stale",
      message: `Generated catalog artifact is stale: ${changed}. Run registry-cli build.`,
    });
  }
  const builtArtifacts = await buildRegistryArtifacts({ rootDir });
  for (const [path, expected] of Object.entries(builtArtifacts.generatedFiles)) {
    const actual = await readFile(join(rootDir, path), "utf8").catch(() => null);
    if (actual !== null && actual !== expected) {
      pushContextualViolation(violations, entries, {
        code: "generated-artifacts-stale",
        message: `Generated catalog artifact is stale: ${path}. Run registry-cli build.`,
      });
    }
  }
  for (const violation of await catalogGeneratedArtifactViolations(rootDir, entries)) {
    violations.push(violation);
  }

  for (const entry of entries) {
    await access(join(rootDir, entry.generatedTestPath)).catch(() => {
      violations.push({
        code: "missing-generated-test",
        message: "Generated MCP manifest is missing its committed generated test.",
        ...entry,
      });
    });
  }

  for (const path of uniqueSorted([
    ...(options.trackedFiles ?? []),
    ...(await trackedGeneratedFiles(rootDir)),
  ])) {
    if (!path.startsWith(`${GENERATED_MCP_CODEGEN_ROOT}/`) && path !== ".generated") continue;
    violations.push({
      code: "tracked-generated-artifact",
      message: `.generated artifacts must stay gitignored and untracked: ${path}.`,
      ...entryFieldsForCodegenPath(entries, path),
      codegenPath: path,
    });
  }

  for (const violation of await sandboxBypassViolations(rootDir, entries)) {
    violations.push(violation);
  }

  return { ok: violations.length === 0, entries, violations };
}

export function formatGeneratedMcpReadinessResult(result: GeneratedMcpReadinessResult): string {
  if (result.ok) {
    return `Generated MCP readiness passed for ${result.entries.length} generated entr${result.entries.length === 1 ? "y" : "ies"}.\n`;
  }

  return `${result.violations
    .map((violation) => {
      const context = [
        violation.provider ? `provider=${violation.provider}` : undefined,
        violation.family ? `family=${violation.family}` : undefined,
        violation.manifestPath ? `manifest=${violation.manifestPath}` : undefined,
        violation.generatedTestPath ? `test=${violation.generatedTestPath}` : undefined,
        violation.codegenPath ? `codegen=${violation.codegenPath}` : undefined,
      ]
        .filter(Boolean)
        .join(" ");
      return `- [${violation.code}]${context ? ` ${context}` : ""}: ${violation.message}`;
    })
    .join("\n")}\n`;
}

async function discoverGeneratedMcpEntries(
  rootDir: string,
  violations: GeneratedMcpReadinessViolation[],
): Promise<GeneratedMcpReadinessEntry[]> {
  const registryDir = join(rootDir, "registry");
  const files = await findFiles(registryDir, (name) => isMcpManifestFileName(name));
  const entries: GeneratedMcpReadinessEntry[] = [];

  for (const file of files) {
    const manifestPath = normalizePath(relative(rootDir, file));
    const manifest = await readManifest(file).catch((error: unknown) => {
      violations.push({
        code: "registry-validation-failed",
        message: error instanceof Error ? error.message : String(error),
        manifestPath,
      });
      return null;
    });
    if (!manifest || !isGeneratedManifest(manifest)) continue;

    const provider = manifestPath.split("/")[1] ?? "";
    const family = importerFamily(manifest.spec.importer.engine);
    const capability = basename(manifestPath).replace(/\.mcp\.(json|ya?ml)$/i, "");
    const paths = generatedMcpWorkspacePaths({ provider, family, capability });

    entries.push({
      provider,
      family,
      manifestPath,
      generatedTestPath: paths.generatedTestPath,
      codegenPath: paths.codegenProjectPath,
    });
  }

  return entries.sort((left, right) => left.manifestPath.localeCompare(right.manifestPath));
}

async function readManifest(path: string): Promise<ReturnType<typeof validateMcpManifestImporterConfig>> {
  const raw = await readFile(path, "utf8");
  const value = extname(path) === ".json" ? JSON.parse(raw) : parseYaml(raw);
  return validateMcpManifestImporterConfig(McpManifestSchema.parse(value));
}

function isGeneratedManifest(manifest: ReturnType<typeof validateMcpManifestImporterConfig>): boolean {
  return (
    manifest.metadata.labels.includes("generated") ||
    Boolean(manifest._meta?.[GENERATED_MCP_SOURCE_META_KEY]) ||
    Boolean(manifest._meta?.[GENERATED_MCP_POLICY_META_KEY])
  );
}

function importerFamily(engine: string): GeneratedMcpFamily {
  return generatedMcpWorkspacePaths({
    provider: "family-check",
    family: importerEngineForFamily(engine),
    capability: "api",
  }).family;
}

async function sandboxBypassViolations(
  rootDir: string,
  entries: readonly GeneratedMcpReadinessEntry[],
): Promise<GeneratedMcpReadinessViolation[]> {
  const codegenDir = join(rootDir, "packages", "tools", "registry-cli", "src", "codegen");
  const files = await findFiles(codegenDir, (name) => name.endsWith(".ts"));
  const violations: GeneratedMcpReadinessViolation[] = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (!containsDirectHostExecutionPrimitive(source)) continue;
    pushContextualViolation(violations, entries, {
      code: "sandbox-bypass",
      message: `Codegen source contains direct host execution primitive: ${normalizePath(relative(rootDir, file))}.`,
    });
  }

  return violations;
}

async function catalogGeneratedArtifactViolations(
  rootDir: string,
  entries: readonly GeneratedMcpReadinessEntry[],
): Promise<GeneratedMcpReadinessViolation[]> {
  const violations: GeneratedMcpReadinessViolation[] = [];
  const serversJson = await readJsonFile(join(rootDir, "servers.json")).catch(() => null);
  const indexJson = await readJsonFile(join(rootDir, "registry", "index.json")).catch(() => null);

  for (const path of generatedPathReferences(serversJson)) {
    pushContextualViolation(violations, entries, {
      code: "catalog-includes-generated-artifact",
      message: `servers.json must not reference generated project output: ${path}.`,
    });
  }
  for (const path of generatedPathReferences(indexJson)) {
    pushContextualViolation(violations, entries, {
      code: "catalog-includes-generated-artifact",
      message: `registry/index.json must not reference generated project output: ${path}.`,
    });
  }

  return violations;
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function generatedPathReferences(value: unknown): string[] {
  const references: string[] = [];
  collectGeneratedPathReferences(value, references);
  return uniqueSorted(references);
}

function collectGeneratedPathReferences(value: unknown, references: string[]): void {
  if (typeof value === "string") {
    if (value.startsWith(`${GENERATED_MCP_CODEGEN_ROOT}/`)) references.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectGeneratedPathReferences(item, references);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const item of Object.values(value)) collectGeneratedPathReferences(item, references);
}

function pushContextualViolation(
  violations: GeneratedMcpReadinessViolation[],
  entries: readonly GeneratedMcpReadinessEntry[],
  violation: GeneratedMcpReadinessViolation,
): void {
  if (entries.length === 0) {
    violations.push(violation);
    return;
  }
  for (const entry of entries) {
    violations.push({ ...entry, ...violation });
  }
}

function containsDirectHostExecutionPrimitive(source: string): boolean {
  return DIRECT_HOST_EXECUTION_TERMS.map((term) => term.join("")).some((term) =>
    /\w/.test(term.at(-1) ?? "")
      ? new RegExp(`\\b${escapeRegExp(term)}\\b`).test(source)
      : source.includes(term),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function trackedGeneratedFiles(rootDir: string): Promise<string[]> {
  const gitDir = await resolveGitDir(rootDir).catch(() => null);
  if (!gitDir) return [];
  const index = await readFile(join(gitDir, "index")).catch(() => null);
  if (!index) return [];
  return uniqueSorted(index.toString("utf8").match(/\.generated\/[A-Za-z0-9._/@-]+/g) ?? []);
}

async function resolveGitDir(rootDir: string): Promise<string> {
  const dotGit = join(rootDir, ".git");
  const raw = await readFile(dotGit, "utf8").catch(() => null);
  if (raw?.startsWith("gitdir:")) {
    const gitDir = raw.slice("gitdir:".length).trim();
    return resolve(dirname(dotGit), gitDir);
  }
  return dotGit;
}

async function findFiles(
  dir: string,
  predicate: (name: string, path: string) => boolean,
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return findFiles(path, predicate);
      if (entry.isFile() && predicate(entry.name, path)) return [path];
      return [];
    }),
  );
  return files.flat().sort((left, right) => left.localeCompare(right));
}

function entryFieldsForPath(
  entries: readonly GeneratedMcpReadinessEntry[],
  path: string,
): Partial<GeneratedMcpReadinessEntry> {
  return entries.find((entry) => entry.manifestPath === path) ?? {};
}

function entryFieldsForCodegenPath(
  entries: readonly GeneratedMcpReadinessEntry[],
  path: string,
): Partial<GeneratedMcpReadinessEntry> {
  return entries.find((entry) => path.startsWith(entry.codegenPath)) ?? {};
}

function isMcpManifestFileName(name: string): boolean {
  return name.endsWith(".mcp.json") || name.endsWith(".mcp.yaml") || name.endsWith(".mcp.yml");
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
