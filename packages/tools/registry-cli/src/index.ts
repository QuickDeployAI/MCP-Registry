#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ValidationResult = {
  errors: string[];
  checkedServers: number;
  checkedRemoteRefs: number;
  checkedWorkspacePackages: number;
};

type JsonObject = Record<string, unknown>;

type ServerManifest = JsonObject & {
  name?: unknown;
  version?: unknown;
  packages?: unknown;
};

type ServerPackage = JsonObject & {
  registryType?: unknown;
  identifier?: unknown;
  version?: unknown;
  digest?: unknown;
};

type RegistryIndex = JsonObject & {
  agents?: unknown;
};

type RegistryAgent = JsonObject & {
  id?: unknown;
  server?: unknown;
  summary?: unknown;
};

type RemoteRefSeedCatalog = JsonObject & {
  seeds?: unknown;
};

type RemoteRefSeed = JsonObject & {
  id?: unknown;
  category?: unknown;
  disposition?: unknown;
  source_issue?: unknown;
  references?: unknown;
  endpoint?: unknown;
  deploy_recipe?: unknown;
  curation?: unknown;
};

type WorkspacePackage = {
  name: string;
  path: string;
  private: boolean;
  dependencies: Record<string, unknown>;
};

const EXACT_SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const OCI_DIGEST = /^sha256:[a-f0-9]{64}$/i;
const REMOTE_REF_SEED_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LINEAR_ISSUE_ID = /^QUI-\d+$/;
const REMOTE_REF_CATEGORIES = new Set([
  "data-stack",
  "eventing-streaming",
  "iot-home",
  "dev-platform",
  "knowledge-docs",
]);
const REMOTE_REF_DISPOSITIONS = new Set(["remote-ref", "deploy-recipe", "watch"]);

export async function validateRepository(root: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const absoluteRoot = resolve(root);
  const serverPaths = await discoverServerManifests(absoluteRoot);
  const registryIndex = await readOptionalJson<RegistryIndex>(join(absoluteRoot, "registry/index.json"));
  const agents = Array.isArray(registryIndex?.agents) ? (registryIndex.agents as RegistryAgent[]) : [];
  const agentsByServer = new Map<string, RegistryAgent>();

  for (const agent of agents) {
    if (typeof agent.server === "string") {
      agentsByServer.set(normalizePath(agent.server), agent);
    }
  }

  for (const serverPath of serverPaths) {
    await validateServerManifest(absoluteRoot, serverPath, agentsByServer, errors);
  }

  const checkedRemoteRefs = await validateRemoteRefSeeds(absoluteRoot, errors);
  const checkedWorkspacePackages = await validateWorkspacePackages(absoluteRoot, errors);

  return {
    errors,
    checkedServers: serverPaths.length,
    checkedRemoteRefs,
    checkedWorkspacePackages,
  };
}

async function validateWorkspacePackages(root: string, errors: string[]): Promise<number> {
  const packages = await discoverWorkspacePackages(root);
  const packagesByName = new Map(packages.map((workspacePackage) => [workspacePackage.name, workspacePackage]));

  for (const workspacePackage of packages) {
    if (workspacePackage.private) {
      continue;
    }

    for (const [dependencyName, spec] of Object.entries(workspacePackage.dependencies)) {
      if (spec !== "workspace:*") {
        continue;
      }

      const dependencyPackage = packagesByName.get(dependencyName);

      if (dependencyPackage?.private) {
        errors.push(
          `${workspacePackage.path}: dependency ${dependencyName} uses workspace:* but target ${dependencyPackage.path} is private`,
        );
      }
    }
  }

  return packages.length;
}

async function validateRemoteRefSeeds(root: string, errors: string[]): Promise<number> {
  const seedPath = "registry/remote-ref-seeds.json";
  const catalog = await readOptionalJson<RemoteRefSeedCatalog>(join(root, seedPath));

  if (!catalog) {
    return 0;
  }

  if (catalog.kind !== "quickdeploy.mcp-remote-ref-seeds") {
    errors.push(`${seedPath}: kind must be quickdeploy.mcp-remote-ref-seeds`);
  }

  if (typeof catalog.schema_version !== "string") {
    errors.push(`${seedPath}: schema_version must be a string`);
  }

  const seeds = Array.isArray(catalog.seeds) ? (catalog.seeds as RemoteRefSeed[]) : undefined;

  if (!seeds) {
    errors.push(`${seedPath}: seeds must be an array`);
    return 0;
  }

  const seenIds = new Set<string>();

  for (const [index, seed] of seeds.entries()) {
    validateRemoteRefSeed(`${seedPath}#seeds[${index}]`, seed, seenIds, errors);
  }

  return seeds.length;
}

function validateRemoteRefSeed(
  label: string,
  seed: RemoteRefSeed,
  seenIds: Set<string>,
  errors: string[],
): void {
  const id = stringValue(seed.id);
  const category = stringValue(seed.category);
  const disposition = stringValue(seed.disposition);
  const sourceIssue = stringValue(seed.source_issue);

  if (!id || !REMOTE_REF_SEED_ID.test(id)) {
    errors.push(`${label}: id must be kebab-case`);
  } else if (seenIds.has(id)) {
    errors.push(`${label}: duplicate id ${id}`);
  } else {
    seenIds.add(id);
  }

  if (!category || !REMOTE_REF_CATEGORIES.has(category)) {
    errors.push(`${label}: category must be one of ${Array.from(REMOTE_REF_CATEGORIES).join(", ")}`);
  }

  if (!disposition || !REMOTE_REF_DISPOSITIONS.has(disposition)) {
    errors.push(`${label}: disposition must be remote-ref, deploy-recipe, or watch`);
  }

  if (!sourceIssue || !LINEAR_ISSUE_ID.test(sourceIssue)) {
    errors.push(`${label}: source_issue must be a Linear issue id`);
  }

  const references = Array.isArray(seed.references) ? seed.references : [];

  if (references.length === 0) {
    errors.push(`${label}: references must include at least one source`);
  }

  const curation = isObject(seed.curation) ? seed.curation : undefined;

  if (!curation || typeof curation.provenance !== "string") {
    errors.push(`${label}: curation.provenance must be set`);
  }

  const endpoint = isObject(seed.endpoint) ? seed.endpoint : undefined;
  const deployRecipe = isObject(seed.deploy_recipe) ? seed.deploy_recipe : undefined;

  if (disposition === "remote-ref" && typeof endpoint?.url !== "string") {
    errors.push(`${label}: remote-ref seeds must include endpoint.url`);
  }

  if (disposition === "deploy-recipe" && typeof deployRecipe?.summary !== "string") {
    errors.push(`${label}: deploy-recipe seeds must include deploy_recipe.summary`);
  }
}

async function validateServerManifest(
  root: string,
  serverPath: string,
  agentsByServer: Map<string, RegistryAgent>,
  errors: string[],
): Promise<void> {
  const relativeServerPath = normalizePath(relative(root, serverPath));
  const server = await readJson<ServerManifest>(serverPath);
  const serverLabel = typeof server.name === "string" ? server.name : relativeServerPath;
  const version = stringValue(server.version);

  if (!version || !EXACT_SEMVER.test(version)) {
    errors.push(`${relativeServerPath}: server version must be an exact semver version`);
  }

  const packageJsonPath = join(dirname(serverPath), "package.json");
  const packageJson = await readOptionalJson<JsonObject>(packageJsonPath);

  if (packageJson && typeof packageJson.version === "string" && version && packageJson.version !== version) {
    errors.push(`${relativeServerPath}: package.json version ${packageJson.version} does not match server.json ${version}`);
  }

  const packages = Array.isArray(server.packages) ? (server.packages as ServerPackage[]) : [];
  const npmPackage = packages.find((entry) => entry.registryType === "npm");

  if (packageJson && npmPackage && typeof packageJson.name === "string" && npmPackage.identifier !== packageJson.name) {
    errors.push(`${relativeServerPath}: npm package identifier ${String(npmPackage.identifier)} does not match ${packageJson.name}`);
  }

  for (const entry of packages) {
    validatePackageEntry(relativeServerPath, entry, version, errors);
  }

  const agent = agentsByServer.get(relativeServerPath);
  if (!agent) {
    errors.push(`${relativeServerPath}: registry/index.json is missing an agent entry`);
    return;
  }

  const summary = isObject(agent.summary) ? agent.summary : undefined;
  const summaryVersion = stringValue(summary?.version);

  if (version && summaryVersion !== version) {
    errors.push(`${relativeServerPath}: registry summary version ${String(summaryVersion)} does not match server.json ${version}`);
  }

  if (packageJson && summary && typeof packageJson.name === "string" && summary.package !== packageJson.name) {
    errors.push(`${relativeServerPath}: registry summary package ${String(summary.package)} does not match ${packageJson.name}`);
  }

  if (packages.length === 0) {
    errors.push(`${relativeServerPath}: ${serverLabel} must declare at least one package entry`);
  }
}

function validatePackageEntry(
  serverPath: string,
  entry: ServerPackage,
  serverVersion: string | undefined,
  errors: string[],
): void {
  const entryVersion = stringValue(entry.version);
  const identifier = stringValue(entry.identifier) ?? "<unknown>";

  if (!entryVersion || !EXACT_SEMVER.test(entryVersion)) {
    errors.push(`${serverPath}: package ${identifier} version must be an exact semver version`);
  }

  if (serverVersion && entryVersion && entryVersion !== serverVersion) {
    errors.push(`${serverPath}: package ${identifier} version ${entryVersion} does not match server.json ${serverVersion}`);
  }

  if (isOciPackage(entry)) {
    const digest = stringValue(entry.digest);

    if (!digest || !OCI_DIGEST.test(digest)) {
      errors.push(`${serverPath}: OCI package ${identifier} must record a sha256 digest`);
    }

    if (entryVersion && !identifier.endsWith(`:${entryVersion}`)) {
      errors.push(`${serverPath}: OCI package ${identifier} must be tagged with version ${entryVersion}`);
    }
  }
}

function isOciPackage(entry: ServerPackage): boolean {
  const registryType = stringValue(entry.registryType)?.toLowerCase();

  return registryType === "oci" || registryType === "docker" || registryType === "container";
}

async function discoverServerManifests(root: string): Promise<string[]> {
  const candidates = [join(root, "servers"), join(root, "packages/mcps")];
  const manifests: string[] = [];

  for (const candidate of candidates) {
    for (const child of await readDirectories(candidate)) {
      manifests.push(join(candidate, child, "server.json"));
    }
  }

  return manifests.sort();
}

async function discoverWorkspacePackages(root: string): Promise<WorkspacePackage[]> {
  const packageRoots = [join(root, "packages")];
  const packages: WorkspacePackage[] = [];

  for (const packageRoot of packageRoots) {
    for (const packageJsonPath of await discoverPackageJsonFiles(packageRoot)) {
      const packageJson = await readJson<JsonObject>(packageJsonPath);
      const name = stringValue(packageJson.name);

      if (!name) {
        continue;
      }

      packages.push({
        name,
        path: normalizePath(relative(root, packageJsonPath)),
        private: packageJson.private === true,
        dependencies: isObject(packageJson.dependencies) ? packageJson.dependencies : {},
      });
    }
  }

  return packages.sort((left, right) => left.path.localeCompare(right.path));
}

async function discoverPackageJsonFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  for (const entry of await readDirectoryEntries(root)) {
    const entryPath = join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await discoverPackageJsonFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name === "package.json") {
      files.push(entryPath);
    }
  }

  return files;
}

async function readDirectories(path: string): Promise<string[]> {
  try {
    const entries = await readDirectoryEntries(path);
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function readDirectoryEntries(path: string) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | undefined> {
  try {
    return await readJson<T>(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command !== "validate") {
    console.error("Usage: registry-cli validate [--root <path>]");
    process.exitCode = 2;
    return;
  }

  const root = parseRoot(args);
  const result = await validateRepository(root);

  if (result.errors.length > 0) {
    console.error(`registry-cli validate failed with ${result.errors.length} error(s):`);
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `registry-cli validate passed (${result.checkedServers} server manifest(s), ${result.checkedRemoteRefs} remote ref seed(s), ${result.checkedWorkspacePackages} workspace package(s))`,
  );
}

function parseRoot(args: string[]): string {
  const rootIndex = args.indexOf("--root");

  if (rootIndex >= 0) {
    const root = args[rootIndex + 1];
    return root ? resolve(root) : process.cwd();
  }

  return process.cwd();
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : "";

if (currentFile === invokedFile) {
  await main();
}
