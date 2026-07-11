import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  credentialBindingsFromMcpAuth,
  credentialEnvironmentVariables,
} from "@quickdeployai/importer-core";
import {
  type ArdEntry,
  ArdEntrySchema,
  OFFICIAL_MCP_SERVER_SCHEMA_2025_12_11,
  QUICKDEPLOY_ARD_ENTRY_META_KEY,
  QUICKDEPLOY_MCP_PROJECTION_META_KEY,
  QUICKDEPLOY_REGISTRY_CURATION_META_KEY,
  QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY,
  type McpManifest,
  type McpManifestServerRemote,
  McpManifestSchema,
  type ServersJsonEnvelope,
  ServersJsonEnvelopeSchema,
  OfficialServerJsonDocumentSchema,
  attachMcpManifestToServerJson,
  type OfficialServerJsonDocument,
  type McpProjectionConfig,
  McpProjectionConfigSchema,
  sourceMediaTypeToImporterEngine,
  validateMcpManifestImporterConfig,
} from "@quickdeployai/registry-schemas";

const SERVERS_JSON_SCHEMA = "https://quickdeploy.ai/schemas/servers-json.schema.json";
const MCP_HOST_IMAGE = "ghcr.io/quickdeployai/mcp-host";
const QUICKDEPLOY_PROXY_GATEWAY_BASE_URL = "https://mcp.quickdeploy.ai/proxy";
const MANIFEST_CONFIG_ENV_PREFIX = "QD_MANIFEST";
const DEFAULT_BAKED_MANIFEST_PATH = "/app/manifest.mcp.yaml";
const OCI_SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/i;
const ARD_ENTRY_EXTENSION = ".ard.json";
const PROJECTION_CONFIG_EXTENSION = ".projection.json";

export interface RegistryBuildOptions {
  rootDir: string;
}

export interface RegistryBuildArtifacts {
  serversJson: ServersJsonEnvelope;
  indexJson: RegistrySourceIndex;
  files: {
    "servers.json": string;
  };
  generatedFiles: {
    "registry/index.json": string;
  };
}

export interface RegistrySourceIndex {
  schemaVersion: "quickdeploy.mcp-registry/v1";
  generatedBy: "@quickdeployai/registry-cli";
  providers: RegistrySourceProvider[];
}

export interface RegistrySourceProvider {
  id: string;
  entries: RegistrySourceIndexEntry[];
}

export interface RegistrySourceIndexEntry {
  path: string;
  kind: "ard-projection" | "mcp-manifest" | "server-json";
  name: string;
  version?: string;
}

export interface BakedManifestServerJsonOptions {
  sourceManifestPath: string;
  image: string;
  digest: string;
  bakedManifestPath?: string;
}

export interface BakedManifestFileOptions {
  rootDir: string;
  manifestPath: string;
  image: string;
  digest: string;
  bakedManifestPath?: string;
}

interface DiscoveredJson {
  path: string;
  value: unknown;
}

type OciImageDigestMap = Map<string, string>;

export async function buildRegistryArtifacts(
  options: RegistryBuildOptions,
): Promise<RegistryBuildArtifacts> {
  const registrySources = await discoverRegistrySources(options.rootDir);
  const imageDigests = await readOciImageDigests(options.rootDir);
  const servers = applyOciDigestPins(
    registrySources.map((source) => source.document),
    imageDigests,
  ).sort((left, right) => left.name.localeCompare(right.name));

  const parsed = ServersJsonEnvelopeSchema.parse({
    $schema: SERVERS_JSON_SCHEMA,
    servers,
    _meta: {
      "ai.quickdeploy.registry/generatedBy": "@quickdeployai/registry-cli",
      "ai.quickdeploy.registry/sourceCount": servers.length,
    },
  });
  return {
    serversJson: parsed,
    indexJson: registrySourceIndex(registrySources),
    files: {
      "servers.json": stableJson(parsed),
    },
    generatedFiles: {
      "registry/index.json": stableJson(registrySourceIndex(registrySources)),
    },
  };
}

export async function writeRegistryArtifacts(
  options: RegistryBuildOptions,
  artifacts?: RegistryBuildArtifacts,
): Promise<void> {
  const artifactsToWrite = artifacts ?? (await buildRegistryArtifacts(options));
  for (const [path, contents] of Object.entries(artifactsToWrite.files)) {
    const target = join(options.rootDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
  }
  for (const [path, contents] of Object.entries(artifactsToWrite.generatedFiles)) {
    const target = join(options.rootDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
  }
}

export async function checkGeneratedRegistryArtifacts(options: RegistryBuildOptions): Promise<{
  ok: boolean;
  changed: string[];
}> {
  const artifacts = await buildRegistryArtifacts(options);
  const changed: string[] = [];

  for (const [path, expected] of Object.entries(artifacts.files)) {
    const actual = await readFile(join(options.rootDir, path), "utf8").catch(() => null);
    if (actual !== null && actual !== expected) changed.push(path);
  }

  return { ok: changed.length === 0, changed };
}

async function readOciImageDigests(rootDir: string): Promise<OciImageDigestMap> {
  const path = join(rootDir, "generated", "oci-image-digests.json");
  const raw = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (raw === null) return new Map();

  const value = JSON.parse(raw) as unknown;
  if (!isRecord(value) || !isRecord(value.images)) return new Map();

  const digests = new Map<string, string>();
  for (const [image, digest] of Object.entries(value.images)) {
    if (typeof digest === "string" && /^sha256:[a-f0-9]{64}$/i.test(digest)) {
      digests.set(image, digest.toLowerCase());
    }
  }
  return digests;
}

function applyOciDigestPins(
  servers: OfficialServerJsonDocument[],
  digests: OciImageDigestMap,
): OfficialServerJsonDocument[] {
  if (digests.size === 0) return servers;

  return servers.map((server) => ({
    ...server,
    packages: server.packages?.map((pkg) => {
      if (pkg.registryType.toLowerCase() !== "oci" || !pkg.identifier) return pkg;
      const image = stripOciDigest(pkg.identifier);
      const digest = digests.get(pkg.identifier) ?? digests.get(image);
      if (!digest) return pkg;
      return {
        ...pkg,
        identifier: `${stripImageTag(image)}@${digest}`,
      };
    }),
  }));
}

interface RegistrySource {
  provider: string;
  path: string;
  kind: RegistrySourceIndexEntry["kind"];
  document: OfficialServerJsonDocument;
}

async function discoverRegistrySources(rootDir: string): Promise<RegistrySource[]> {
  const registryDir = join(rootDir, "registry");
  const files = await findFiles(registryDir, (name, path) => {
    const relativePath = normalizePath(relative(rootDir, path));
    if (relativePath === "registry/index.json") return false;
    return isArdEntryFileName(name) || isMcpManifestFileName(name) || isServerManifestFileName(name);
  });

  const discovered = new Set(files);
  const preferredFiles = files.filter((path) => {
    if (!isMcpManifestFileName(path)) return true;
    const basePath = path.replace(/\.mcp\.(json|ya?ml)$/i, "");
    return !discovered.has(`${basePath}${ARD_ENTRY_EXTENSION}`);
  });
  const sources = await Promise.all(preferredFiles.map((path) => readRegistrySource(rootDir, path)));
  return sources.sort((left, right) => left.path.localeCompare(right.path));
}

async function readRegistrySource(rootDir: string, path: string): Promise<RegistrySource> {
  const relativePath = normalizePath(relative(rootDir, path));
  const provider = providerFromRegistryPath(relativePath);
  if (isServerManifestFileName(path)) {
    return {
      provider,
      path: relativePath,
      kind: "server-json",
      document: parseServerJson((await readJson(path)).value, relativePath),
    };
  }

  if (isArdEntryFileName(path)) {
    const entryPath = relativePath;
    const projectionPath = projectionPathForEntryPath(entryPath);
    const entry = parseArdEntryForRegistry((await readJson(path)).value, entryPath);
    const projection = parseProjectionForRegistry(
      (await readJson(join(rootDir, projectionPath))).value,
      projectionPath,
    );
    return {
      provider,
      path: entryPath,
      kind: "ard-projection",
      document: compileArdProjectionToServerJson(entry, projection, { entryPath, projectionPath }),
    };
  }

  const { manifest } = await readManifest(rootDir, path);
  return {
    provider,
    path: relativePath,
    kind: "mcp-manifest",
    document: compileManifestToServerJson(manifest, relativePath),
  };
}

export interface ArdProjectionServerJsonOptions {
  entryPath: string;
  projectionPath: string;
}

export function compileArdProjectionToServerJson(
  entry: unknown,
  projection: unknown,
  options: ArdProjectionServerJsonOptions,
): OfficialServerJsonDocument {
  const entryPath = normalizePath(options.entryPath);
  const projectionPath = normalizePath(options.projectionPath);
  const parsedEntry = parseArdEntryForRegistry(entry, entryPath);
  const parsedProjection = parseProjectionForRegistry(projection, projectionPath);
  const manifest = projectionToMcpManifest(parsedEntry, parsedProjection, entryPath);

  return compileMcpRuntimeServerJson(manifest, {
    runtimeConfigPath: entryPath,
    runtimeArguments: [
      "run",
      entryPath,
      "--projection",
      projectionPath,
      "--transport",
      parsedProjection.deployment.transport,
    ],
    sourcePath: entryPath,
    embedManifest: false,
    curationTags: ["ard-entry", "projection-backed", ...(parsedEntry.tags ?? [])],
    meta: {
      [QUICKDEPLOY_ARD_ENTRY_META_KEY]: parsedEntry,
      [QUICKDEPLOY_MCP_PROJECTION_META_KEY]: parsedProjection,
    },
  });
}

export function compileManifestToServerJson(
  manifest: unknown,
  relativePath: string,
): OfficialServerJsonDocument {
  const normalizedRelativePath = normalizePath(relativePath);
  const parsedManifest = parseManifestForRegistry(manifest, normalizedRelativePath);
  return compileMcpRuntimeServerJson(parsedManifest, {
    runtimeConfigPath: normalizedRelativePath,
    sourcePath: normalizedRelativePath,
    curationTags: ["manifest-backed", ...parsedManifest.metadata.labels],
    meta: {
      [QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY]: parsedManifest,
    },
  });
}

function compileMcpRuntimeServerJson(
  parsedManifest: McpManifest,
  options: {
    runtimeConfigPath: string;
    runtimeArguments?: string[];
    sourcePath: string;
    curationTags: string[];
    meta: Record<string, unknown>;
    embedManifest?: boolean;
  },
): OfficialServerJsonDocument {
  const envVars = manifestEnvironmentVariables(parsedManifest);
  const manifestServer = parsedManifest.server;
  const document = {
      $schema: OFFICIAL_MCP_SERVER_SCHEMA_2025_12_11,
      name: parsedManifest.metadata.name,
      version: parsedManifest.metadata.version,
      description: parsedManifest.metadata.description ?? parsedManifest.metadata.title,
      packages: [
        {
          registryType: "oci",
          identifier: MCP_HOST_IMAGE,
          runtimeHint: "mcp-host",
          transport: parsedManifest.deployment.transport,
          runtimeArguments: options.runtimeArguments ?? [
            "run",
            options.runtimeConfigPath,
            "--transport",
            parsedManifest.deployment.transport,
          ],
          ...(envVars.length > 0
            ? { environmentVariables: envVars.map((variable) => variable.name) }
            : {}),
        },
        ...(manifestServer?.packages ?? []),
      ],
      ...(manifestServer?.remotes.length
        ? { remotes: proxyGatewayRemotes(parsedManifest, options.sourcePath) }
        : {}),
      ...(envVars.length > 0 ? { environmentVariables: envVars } : {}),
      _meta: {
        [QUICKDEPLOY_REGISTRY_CURATION_META_KEY]: {
          verifiedStatus: "review",
          category: parsedManifest.spec.importer.engine,
          isOfficial: true,
          tags: uniqueStrings(options.curationTags),
        },
        ...options.meta,
      },
    };
  const server = options.embedManifest === false
    ? document
    : attachMcpManifestToServerJson(document, parsedManifest);

  return parseServerJson(server, options.sourcePath);
}

export function compileBakedManifestToServerJson(
  manifest: unknown,
  options: BakedManifestServerJsonOptions,
): OfficialServerJsonDocument {
  const sourceManifestPath = normalizePath(options.sourceManifestPath);
  const bakedManifestPath = options.bakedManifestPath ?? DEFAULT_BAKED_MANIFEST_PATH;
  const digest = normalizeOciDigest(options.digest);
  const parsedManifest = parseManifestForRegistry(manifest, sourceManifestPath);
  const envVars = manifestEnvironmentVariables(parsedManifest);
  const server = attachMcpManifestToServerJson(
    {
      $schema: OFFICIAL_MCP_SERVER_SCHEMA_2025_12_11,
      name: parsedManifest.metadata.name,
      version: parsedManifest.metadata.version,
      description: parsedManifest.metadata.description ?? parsedManifest.metadata.title,
      packages: [
        {
          registryType: "oci",
          identifier: `${options.image}@${digest}`,
          version: parsedManifest.metadata.version,
          runtimeHint: "mcp-host",
          transport: parsedManifest.deployment.transport,
          runtimeArguments: [
            "run",
            bakedManifestPath,
            "--transport",
            parsedManifest.deployment.transport,
          ],
          ...(envVars.length > 0
            ? { environmentVariables: envVars.map((variable) => variable.name) }
            : {}),
        },
      ],
      ...(envVars.length > 0 ? { environmentVariables: envVars } : {}),
      _meta: {
        [QUICKDEPLOY_REGISTRY_CURATION_META_KEY]: {
          verifiedStatus: "review",
          category: parsedManifest.spec.importer.engine,
          isOfficial: true,
          tags: uniqueStrings(["manifest-backed", "baked-oci", ...parsedManifest.metadata.labels]),
        },
        "ai.quickdeploy.registry/bake": {
          sourceManifestPath,
          bakedManifestPath,
          image: options.image,
          digest,
          runtime: "mcp-host",
        },
      },
    },
    parsedManifest,
  );

  return parseServerJson(server, sourceManifestPath);
}

export async function compileBakedManifestFileToServerJson(
  options: BakedManifestFileOptions,
): Promise<OfficialServerJsonDocument> {
  const manifestPath = normalizePath(options.manifestPath);
  const { manifest } = await readManifest(options.rootDir, join(options.rootDir, manifestPath));
  return compileBakedManifestToServerJson(manifest, {
    sourceManifestPath: manifestPath,
    image: options.image,
    digest: options.digest,
    ...(options.bakedManifestPath ? { bakedManifestPath: options.bakedManifestPath } : {}),
  });
}

export function extractManifestFromServerJson(serverJson: unknown): McpManifest {
  const parsedServer = parseServerJson(serverJson, "server.json");
  return McpManifestSchema.parse(parsedServer._meta?.[QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY]);
}

function manifestEnvironmentVariables(
  manifest: McpManifest,
): Array<{ name: string; description: string; isRequired: boolean; isSecret: boolean }> {
  const variables = new Map<
    string,
    { name: string; description: string; isRequired: boolean; isSecret: boolean }
  >();

  for (const auth of manifest.spec.auth) {
    for (const variable of credentialEnvironmentVariables(credentialBindingsFromMcpAuth([auth]))) {
      variables.set(variable.name, {
        name: variable.name,
        description: `Secret used by ${auth.type} upstream authentication.`,
        isRequired: true,
        isSecret: true,
      });
    }
  }

  const inboundAuth = manifest.deployment.auth;
  if (inboundAuth?.type === "bearer" && inboundAuth.tokenFrom) {
    variables.set(inboundAuth.tokenFrom.env, {
      name: inboundAuth.tokenFrom.env,
      description: "Bearer token required by the hosted MCP endpoint.",
      isRequired: true,
      isSecret: true,
    });
  }
  if (inboundAuth?.type === "oauth2-resource" && inboundAuth.tokenFrom) {
    variables.set(inboundAuth.tokenFrom.env, {
      name: inboundAuth.tokenFrom.env,
      description: "OAuth access token accepted by the hosted MCP endpoint.",
      isRequired: true,
      isSecret: true,
    });
  }

  for (const variable of configSchemaEnvironmentVariables(manifest.spec.config?.schema)) {
    variables.set(variable.name, variable);
  }
  for (const variable of configSchemaEnvironmentVariables(manifest.deployment.configSchema)) {
    variables.set(variable.name, variable);
  }

  return [...variables.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function proxyGatewayRemotes(
  manifest: McpManifest,
  sourceManifestPath: string,
): OfficialServerJsonDocument["remotes"] {
  return (manifest.server?.remotes ?? []).map((remote, index) => ({
    type: remote.type,
    url: quickDeployProxyGatewayUrl(manifest.metadata.name, index),
    ...(remote.variables ? { variables: remote.variables } : {}),
    _meta: {
      "ai.quickdeploy.registry/proxy": {
        sourceManifestPath,
        remoteIndex: index,
        upstream: remoteForProxyMeta(remote),
      },
    },
  }));
}

function quickDeployProxyGatewayUrl(serverName: string, remoteIndex: number): string {
  return `${QUICKDEPLOY_PROXY_GATEWAY_BASE_URL}/${encodeURIComponent(serverName)}/${remoteIndex}/mcp`;
}

function remoteForProxyMeta(remote: McpManifestServerRemote): Record<string, unknown> {
  const { type, url, headers, variables, ...rest } = remote;
  return {
    type,
    url,
    ...(headers ? { headers } : {}),
    ...(variables ? { variables } : {}),
    ...rest,
  };
}

function configSchemaEnvironmentVariables(
  schema: unknown,
): Array<{ name: string; description: string; isRequired: boolean; isSecret: boolean }> {
  if (!isRecord(schema) || !isRecord(schema.properties)) return [];
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);

  return Object.entries(schema.properties)
    .filter(([property]) => required.has(property))
    .map(([property, propertySchema]) => ({
      name: `${MANIFEST_CONFIG_ENV_PREFIX}_${toEnvSegment(property)}`,
      description: schemaPropertyDescription(property, propertySchema),
      isRequired: true,
      isSecret: schemaPropertyIsSecret(propertySchema),
    }));
}

function schemaPropertyDescription(property: string, schema: unknown): string {
  if (isRecord(schema) && typeof schema.description === "string" && schema.description.trim()) {
    return schema.description;
  }
  return `Manifest config value for ${property}.`;
}

function schemaPropertyIsSecret(schema: unknown): boolean {
  if (!isRecord(schema)) return false;
  if (schema.isSecret === true || schema.secret === true || schema.writeOnly === true) return true;
  if (schema["x-secret"] === true || schema["x-quickdeploy-secret"] === true) return true;
  return schema.format === "password";
}

function parseServerJson(value: unknown, path: string): OfficialServerJsonDocument {
  const parsed = OfficialServerJsonDocumentSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid server.json source ${path}: ${parsed.error.message}`);
  }
  return parsed.data;
}

function registrySourceIndex(sources: RegistrySource[]): RegistrySourceIndex {
  const providers = new Map<string, RegistrySourceIndexEntry[]>();
  for (const source of sources) {
    const entries = providers.get(source.provider) ?? [];
    entries.push({
      path: source.path,
      kind: source.kind,
      name: source.document.name,
      ...(source.document.version ? { version: source.document.version } : {}),
    });
    providers.set(source.provider, entries);
  }

  return {
    schemaVersion: "quickdeploy.mcp-registry/v1",
    generatedBy: "@quickdeployai/registry-cli",
    providers: [...providers.entries()]
      .map(([id, entries]) => ({
        id,
        entries: entries.sort((left, right) => left.path.localeCompare(right.path)),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

async function readJson(path: string): Promise<DiscoveredJson> {
  return { path, value: JSON.parse(await readFile(path, "utf8")) };
}

async function readManifest(
  rootDir: string,
  path: string,
): Promise<{ manifest: McpManifest; relativePath: string }> {
  const raw = await readFile(path, "utf8");
  const value = extname(path) === ".json" ? JSON.parse(raw) : parseYaml(raw);
  const relativePath = normalizePath(relative(rootDir, path));
  return {
    manifest: parseManifestForRegistry(value, relativePath),
    relativePath,
  };
}

function parseArdEntryForRegistry(entry: unknown, relativePath: string): ArdEntry {
  try {
    return ArdEntrySchema.parse(entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ARD entry in ${relativePath}: ${message}`);
  }
}

function parseProjectionForRegistry(
  projection: unknown,
  relativePath: string,
): McpProjectionConfig {
  try {
    return McpProjectionConfigSchema.parse(projection);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid MCP projection config in ${relativePath}: ${message}`);
  }
}

function projectionToMcpManifest(
  entry: ArdEntry,
  projection: McpProjectionConfig,
  entryPath: string,
): McpManifest {
  const engine = sourceMediaTypeToImporterEngine(entry.type);
  if (!engine) throw new Error(`ARD entry ${entryPath} type "${entry.type}" has no importer engine mapping.`);
  if (projection.entryRef !== entry.identifier) {
    throw new Error(`MCP projection for ${entryPath} references ${projection.entryRef}, expected ${entry.identifier}.`);
  }
  const slug = entry.identifier.split(":").at(-1);
  if (!slug) throw new Error(`ARD entry ${entry.identifier} has no terminal slug.`);
  return parseManifestForRegistry({
    apiVersion: "quickdeploy.ai/v1",
    kind: "McpManifest",
    metadata: {
      name: `ai.quickdeploy/${slug}`,
      version: entry.version ?? "0.1.0",
      title: entry.displayName,
      description: entry.description,
      labels: entry.tags ?? [],
    },
    spec: {
      importer: { engine, versionRange: projection.importerVersionRange },
      source: sourceFromArdEntry(entry),
      select: projection.select,
      auth: projection.auth,
      ...(projection.config ? { config: projection.config } : {}),
      expose: projection.expose,
    },
    deployment: projection.deployment,
  }, entryPath);
}

function sourceFromArdEntry(entry: ArdEntry): McpManifest["spec"]["source"] {
  if (entry.url) {
    if (entry.url.startsWith("git+https://") || entry.url.startsWith("ssh://")) return { type: "git", uri: entry.url };
    if (entry.url.startsWith("file://")) return { type: "file", uri: entry.url };
    if (entry.url.startsWith("oci://")) return { type: "oci", uri: entry.url };
    return { type: "http", uri: entry.url };
  }
  return { type: "file", uri: `inline:${entry.identifier}` };
}

function projectionPathForEntryPath(entryPath: string): string {
  if (!entryPath.endsWith(ARD_ENTRY_EXTENSION)) {
    throw new Error(`ARD entry path must end with ${ARD_ENTRY_EXTENSION}: ${entryPath}`);
  }
  return `${entryPath.slice(0, -ARD_ENTRY_EXTENSION.length)}${PROJECTION_CONFIG_EXTENSION}`;
}

function parseManifestForRegistry(manifest: unknown, relativePath: string): McpManifest {
  try {
    return validateMcpManifestImporterConfig(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid importer config in ${relativePath}: ${message}`);
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function isMcpManifestFileName(name: string): boolean {
  return name.endsWith(".mcp.json") || name.endsWith(".mcp.yaml") || name.endsWith(".mcp.yml");
}

function isArdEntryFileName(name: string): boolean {
  return name.endsWith(ARD_ENTRY_EXTENSION);
}

function isServerManifestFileName(name: string): boolean {
  return name.endsWith(".server.json");
}

function providerFromRegistryPath(path: string): string {
  const parts = path.split("/");
  if (parts[0] !== "registry" || !parts[1] || parts.length < 3) {
    throw new Error(`Registry source must live under registry/<provider>/: ${path}`);
  }
  return parts[1];
}

function stripOciDigest(identifier: string): string {
  return identifier.split("@sha256:")[0] ?? identifier;
}

function stripImageTag(identifier: string): string {
  const slashIndex = identifier.lastIndexOf("/");
  const colonIndex = identifier.lastIndexOf(":");
  if (colonIndex > slashIndex) return identifier.slice(0, colonIndex);
  return identifier;
}

function toEnvSegment(value: string): string {
  const segment = value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return segment.length > 0 ? segment : "VALUE";
}

function normalizeOciDigest(digest: string): string {
  const normalized = digest.trim().toLowerCase();
  if (!OCI_SHA256_DIGEST_PATTERN.test(normalized)) {
    throw new Error("OCI image digest must be sha256:<64 hex characters>.");
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  return compactShortStringArrays(`${JSON.stringify(value, null, 2)}\n`);
}

function compactShortStringArrays(json: string): string {
  const lines = json.split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const start = /^(\s*(?:"[^"]+": )?)\[$/.exec(line);
    if (!start) {
      output.push(line);
      continue;
    }

    const prefix = start[1] ?? "";
    const itemIndent = `${line.match(/^\s*/)?.[0] ?? ""}  `;
    const items: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const item = new RegExp(`^${escapeRegExp(itemIndent)}(".*")(?:,)?$`).exec(
        lines[cursor] ?? "",
      );
      if (!item) break;
      items.push(item[1] ?? "");
      cursor += 1;
    }

    const end = new RegExp(`^${escapeRegExp(line.match(/^\s*/)?.[0] ?? "")}\\](,?)$`).exec(
      lines[cursor] ?? "",
    );
    const inline = `${prefix}[${items.join(", ")}]${end?.[1] ?? ""}`;
    if (items.length > 0 && items.length <= 4 && end && inline.length <= 100) {
      output.push(inline);
      index = cursor;
      continue;
    }

    output.push(line);
  }

  return output.join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
