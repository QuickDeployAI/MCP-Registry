import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  OfficialServerJsonDocumentSchema,
  type OfficialServerJsonDocument,
  type ServerJsonPackage,
} from "@quickdeployai/registry-schemas";
import { compileManifestToServerJson } from "./registry-build";

/**
 * The generic mcp-host runtime image every projection-backed (unbaked) entry
 * references. It is intentionally untagged/undigested — the digest-pinned
 * package is produced per-manifest by `registry-cli bake`, not by this
 * shared runtime reference — so the OCI digest-pin rule exempts it.
 */
const UNPINNED_RUNTIME_OCI_IDENTIFIER = "ghcr.io/quickdeployai/mcp-host";
const UNPINNED_IMPORTER_OCI_IDENTIFIER_PATTERN =
  /^ghcr\.io\/quickdeployai\/importers\/[a-z0-9._-]+:\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

const NAME_PATTERN = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;
const QUICKDEPLOY_NAME_PREFIX = "ai.quickdeploy/";
const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;
const OCI_DIGEST_SUFFIX_PATTERN = /@sha256:[a-f0-9]{64}$/i;

export type RegistryValidationCode =
  | "invalid-server-json"
  | "invalid-manifest"
  | "invalid-name-format"
  | "name-namespace-mismatch"
  | "version-not-exact"
  | "duplicate-name"
  | "mcpb-missing-file-sha256"
  | "oci-missing-digest-pin";

export interface RegistryValidationViolation {
  code: RegistryValidationCode;
  path: string;
  name?: string;
  message: string;
}

export interface RegistryValidationResult {
  ok: boolean;
  entryCount: number;
  violations: RegistryValidationViolation[];
}

export interface RegistryValidateOptions {
  rootDir: string;
}

type EntryOrigin = "manifest" | "remote";

interface DiscoveredEntry {
  path: string;
  origin: EntryOrigin;
  document: OfficialServerJsonDocument;
}

/**
 * Validate every registry source (`registry/<provider>/*.mcp.*` and
 * `registry/<provider>/*.server.json`)
 * against the rules the servers.json build doesn't already enforce by
 * construction: name format + namespace ownership, exact (non-range) versions,
 * cross-entry name duplicates, `fileSha256` on `mcpb` packages, and
 * digest-pinned identifiers on published `oci` packages.
 *
 * Unlike `buildRegistryArtifacts`, this never throws on the first bad entry —
 * it collects every violation across every source so CI reports the full
 * picture in one pass.
 */
export async function validateRegistryEntries(
  options: RegistryValidateOptions,
): Promise<RegistryValidationResult> {
  const violations: RegistryValidationViolation[] = [];
  const entries = await discoverRegistryEntries(options.rootDir, violations);

  for (const entry of entries) {
    validateEntry(entry, violations);
  }
  validateNoDuplicateNames(entries, violations);

  return {
    ok: violations.length === 0,
    entryCount: entries.length,
    violations,
  };
}

export function formatRegistryValidationViolations(
  violations: RegistryValidationViolation[],
): string {
  if (violations.length === 0) return "Registry validation passed.\n";
  const lines = violations.map(
    (violation) =>
      `- [${violation.code}] ${violation.path}${violation.name ? ` (${violation.name})` : ""}: ${violation.message}`,
  );
  return `${lines.join("\n")}\n`;
}

function validateEntry(entry: DiscoveredEntry, violations: RegistryValidationViolation[]): void {
  const { document, path, origin } = entry;

  if (!NAME_PATTERN.test(document.name)) {
    violations.push({
      code: "invalid-name-format",
      path,
      name: document.name,
      message:
        'Server name must match "<namespace>/<name>" (e.g. "ai.quickdeploy/petstore" or "com.example/mcp").',
    });
  } else {
    const isQuickDeployOwned = origin === "manifest";
    const hasQuickDeployPrefix = document.name.startsWith(QUICKDEPLOY_NAME_PREFIX);
    if (isQuickDeployOwned && !hasQuickDeployPrefix) {
      violations.push({
        code: "name-namespace-mismatch",
        path,
        name: document.name,
        message: `QuickDeploy-owned entries must use the "${QUICKDEPLOY_NAME_PREFIX}" namespace.`,
      });
    }
    if (origin === "remote" && hasQuickDeployPrefix) {
      violations.push({
        code: "name-namespace-mismatch",
        path,
        name: document.name,
        message: `Remote-ref entries must use the provider's real reverse-DNS namespace, not "${QUICKDEPLOY_NAME_PREFIX}".`,
      });
    }
  }

  if (document.version !== undefined) {
    validateExactVersion(document.version, path, document.name, violations);
  }

  for (const [index, pkg] of (document.packages ?? []).entries()) {
    validatePackage(pkg, path, document.name, index, violations);
  }
}

function validatePackage(
  pkg: ServerJsonPackage,
  path: string,
  name: string,
  index: number,
  violations: RegistryValidationViolation[],
): void {
  if (pkg.version !== undefined) {
    validateExactVersion(pkg.version, path, name, violations, index);
  }

  const registryType = pkg.registryType.toLowerCase();

  if (registryType === "mcpb") {
    const fileSha256 = pkg.fileSha256;
    if (typeof fileSha256 !== "string" || !SHA256_HEX_PATTERN.test(fileSha256)) {
      violations.push({
        code: "mcpb-missing-file-sha256",
        path,
        name,
        message: `packages[${index}] is an mcpb package and must set fileSha256 to a 64-character hex SHA-256 digest.`,
      });
    }
  }

  if (
    registryType === "oci" &&
    pkg.identifier !== undefined &&
    pkg.identifier !== UNPINNED_RUNTIME_OCI_IDENTIFIER &&
    !isDigestPinnedByImporterPublishWorkflow(pkg) &&
    !OCI_DIGEST_SUFFIX_PATTERN.test(pkg.identifier)
  ) {
    violations.push({
      code: "oci-missing-digest-pin",
      path,
      name,
      message: `packages[${index}] identifier "${pkg.identifier}" must be digest-pinned as "<image>@sha256:<digest>".`,
    });
  }
}

function isDigestPinnedByImporterPublishWorkflow(pkg: ServerJsonPackage): boolean {
  return (
    pkg.runtimeHint === "node22-importer" &&
    typeof pkg.identifier === "string" &&
    UNPINNED_IMPORTER_OCI_IDENTIFIER_PATTERN.test(pkg.identifier)
  );
}

function validateExactVersion(
  version: string,
  path: string,
  name: string | undefined,
  violations: RegistryValidationViolation[],
  packageIndex?: number,
): void {
  if (EXACT_VERSION_PATTERN.test(version)) return;
  const field = packageIndex === undefined ? "version" : `packages[${packageIndex}].version`;
  violations.push({
    code: "version-not-exact",
    path,
    name,
    message: `${field} "${version}" must be an exact semantic version (no ranges, "latest", or wildcards).`,
  });
}

function validateNoDuplicateNames(
  entries: DiscoveredEntry[],
  violations: RegistryValidationViolation[],
): void {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const name = entry.document.name;
    const firstPath = seen.get(name);
    if (firstPath) {
      violations.push({
        code: "duplicate-name",
        path: entry.path,
        name,
        message: `Duplicate server name "${name}" also declared at ${firstPath}.`,
      });
    } else {
      seen.set(name, entry.path);
    }
  }
}

async function discoverRegistryEntries(
  rootDir: string,
  violations: RegistryValidationViolation[],
): Promise<DiscoveredEntry[]> {
  const registryDir = join(rootDir, "registry");
  const files = await findFiles(registryDir, (name, path) => {
    const relativePath = normalizePath(relative(rootDir, path));
    if (relativePath === "registry/index.json") return false;
    return isMcpManifestFileName(name) || isServerManifestFileName(name);
  });

  const entries: DiscoveredEntry[] = [];
  for (const file of files) {
    const relativePath = normalizePath(relative(rootDir, file));
    if (!isProviderRegistryPath(relativePath)) {
      violations.push({
        code: "invalid-manifest",
        path: relativePath,
        message: "Registry sources must live under registry/<provider>/.",
      });
      continue;
    }
    if (isMcpManifestFileName(relativePath)) {
      const entry = await parseManifestEntry(file, relativePath, violations);
      if (entry) entries.push(entry);
      continue;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      violations.push({
        code: "invalid-server-json",
        path: relativePath,
        message: `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    const parsed = OfficialServerJsonDocumentSchema.safeParse(raw);
    if (!parsed.success) {
      violations.push({
        code: "invalid-server-json",
        path: relativePath,
        message: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
          .join("; "),
      });
      continue;
    }
    entries.push({ path: relativePath, origin: "remote", document: parsed.data });
  }
  return entries;
}

async function parseManifestEntry(
  file: string,
  relativePath: string,
  violations: RegistryValidationViolation[],
): Promise<DiscoveredEntry | undefined> {
  let manifest: unknown;
  try {
    const raw = await readFile(file, "utf8");
    manifest = extname(file) === ".json" ? JSON.parse(raw) : parseYaml(raw);
  } catch (error) {
    violations.push({
      code: "invalid-manifest",
      path: relativePath,
      message: `Failed to parse MCP manifest: ${error instanceof Error ? error.message : String(error)}`,
    });
    return undefined;
  }
  try {
    const document = compileManifestToServerJson(manifest, relativePath);
    return { path: relativePath, origin: "manifest", document };
  } catch (error) {
    violations.push({
      code: "invalid-manifest",
      path: relativePath,
      message: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

async function findFiles(
  dir: string,
  predicate: (name: string, path: string) => boolean,
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return findFiles(path, predicate);
      if (entry.isFile() && predicate(entry.name, path)) return [path];
      return [];
    }),
  );
  return files
    .flat()
    .sort((left, right) => normalizePath(left).localeCompare(normalizePath(right)));
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function isMcpManifestFileName(name: string): boolean {
  return name.endsWith(".mcp.json") || name.endsWith(".mcp.yaml") || name.endsWith(".mcp.yml");
}

function isServerManifestFileName(name: string): boolean {
  return name.endsWith(".server.json");
}

function isProviderRegistryPath(path: string): boolean {
  const parts = path.split("/");
  return parts[0] === "registry" && Boolean(parts[1]) && parts.length >= 3;
}
