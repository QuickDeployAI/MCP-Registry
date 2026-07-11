import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  ArdEntrySchema,
  defaultImportModeFor,
  McpManifestSchema,
  McpProjectionConfigSchema,
  mediaTypeToCapabilityKinds,
  SOURCE_MEDIA_TYPE_TO_IMPORTER_ENGINE,
} from "@quickdeployai/registry-schemas";

const rootDir = resolve(process.argv[2] ?? process.cwd());
const registryDir = join(rootDir, "registry");
const files = await findFiles(registryDir);
let migrated = 0;

for (const path of files) {
  const manifest = McpManifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const mediaType = mediaTypeForEngine(manifest.spec.importer.engine);
  const slug = manifest.metadata.name.split("/").at(-1);
  if (!slug) throw new Error(`Cannot derive ARD identifier from ${manifest.metadata.name}.`);
  const entryRef = `urn:air:quickdeploy.ai:mcp:${slug}`;
  const basePath = path.slice(0, -".mcp.json".length);

  const entry = ArdEntrySchema.parse({
    identifier: entryRef,
    displayName: manifest.metadata.title ?? manifest.metadata.name,
    type: mediaType,
    description: manifest.metadata.description,
    tags: manifest.metadata.labels,
    version: manifest.metadata.version,
    url: manifest.spec.source.uri,
    metadata: {
      importMode: defaultImportModeFor(mediaType),
      capabilityKinds: mediaTypeToCapabilityKinds(mediaType),
      ...(manifest.spec.source.ref ? { sourceRef: manifest.spec.source.ref } : {}),
      ...(manifest.spec.source.digest ? { sourceDigest: manifest.spec.source.digest } : {}),
      ...(manifest._meta ? { legacyMetadata: manifest._meta } : {}),
    },
  });
  const projection = McpProjectionConfigSchema.parse({
    kind: "McpProjectionConfig",
    entryRef,
    importerVersionRange: manifest.spec.importer.versionRange,
    select: manifest.spec.select,
    expose: manifest.spec.expose,
    auth: manifest.spec.auth,
    ...(manifest.spec.config ? { config: manifest.spec.config } : {}),
    deployment: manifest.deployment,
  });

  await writeFile(`${basePath}.ard.json`, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  await writeFile(`${basePath}.projection.json`, `${JSON.stringify(projection, null, 2)}\n`, "utf8");
  migrated += 1;
  process.stdout.write(`Migrated ${relative(rootDir, path)}\n`);
}

process.stdout.write(`Migrated ${migrated} registry manifests to ARD projection pairs.\n`);

function mediaTypeForEngine(engine: string): string {
  const match = Object.entries(SOURCE_MEDIA_TYPE_TO_IMPORTER_ENGINE).find(
    ([, candidate]) => candidate === engine,
  );
  if (!match) throw new Error(`No ARD media type maps to importer engine ${engine}.`);
  return match[0];
}

async function findFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findFiles(path);
    return entry.isFile() && entry.name.endsWith(".mcp.json") ? [path] : [];
  }));
  return files.flat().sort();
}
