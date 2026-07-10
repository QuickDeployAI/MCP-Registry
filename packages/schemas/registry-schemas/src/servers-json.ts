import { z } from "zod";

export const OFFICIAL_SERVER_JSON_SCHEMA_VINTAGES = ["2025-09-29", "2025-12-11"] as const;
export type OfficialServerJsonSchemaVintage = (typeof OFFICIAL_SERVER_JSON_SCHEMA_VINTAGES)[number];

export const QUICKDEPLOY_REGISTRY_META_PREFIX = "ai.quickdeploy.registry/";
export const QUICKDEPLOY_REGISTRY_CURATION_META_KEY = "ai.quickdeploy.registry/curation";
export const QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY = "ai.quickdeploy.registry/manifest";

export const QuickDeployRegistryCurationSchema = z.object({
  verifiedStatus: z
    .enum(["unverified", "verified", "review", "deprecated", "blocked"])
    .default("unverified"),
  category: z.string().min(1).optional(),
  isOfficial: z.boolean().optional(),
  isPaid: z.boolean().optional(),
  tags: z.array(z.string().min(1)).default([]),
});
export type QuickDeployRegistryCuration = z.infer<typeof QuickDeployRegistryCurationSchema>;

export const ServerJsonRemoteSchema = z
  .object({
    type: z.enum(["streamable-http", "sse", "stdio"]).or(z.string().min(1)),
    url: z.string().min(1).optional(),
    headers: z.array(z.record(z.string(), z.unknown())).optional(),
    variables: z.record(z.string(), z.unknown()).optional(),
  })
  .catchall(z.unknown());
export type ServerJsonRemote = z.infer<typeof ServerJsonRemoteSchema>;

export const ServerJsonPackageSchema = z
  .object({
    registryType: z.string().min(1),
    identifier: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    runtimeHint: z.string().min(1).optional(),
    transport: z.string().min(1).optional(),
    runtimeArguments: z.array(z.string()).optional(),
    environmentVariables: z.array(z.string()).optional(),
  })
  .catchall(z.unknown());
export type ServerJsonPackage = z.infer<typeof ServerJsonPackageSchema>;

export const ServerJsonEnvironmentVariableSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    isRequired: z.boolean().optional(),
    isSecret: z.boolean().optional(),
    default: z.string().optional(),
  })
  .catchall(z.unknown());
export type ServerJsonEnvironmentVariable = z.infer<typeof ServerJsonEnvironmentVariableSchema>;

const QUICKDEPLOY_TOP_LEVEL_FIELDS = new Set([
  "verifiedStatus",
  "verified_status",
  "category",
  "isOfficial",
  "is_official",
  "isPaid",
  "is_paid",
  "tags",
  "quickdeploy",
  "quickDeploy",
  "curation",
  "manifest",
]);

export function extractOfficialServerJsonSchemaVintage(
  schemaUri: string | undefined,
): OfficialServerJsonSchemaVintage | null {
  if (!schemaUri) return null;
  for (const vintage of OFFICIAL_SERVER_JSON_SCHEMA_VINTAGES) {
    if (schemaUri.includes(vintage)) return vintage;
  }
  return null;
}

export const ServerJsonMetaSchema = z.record(z.string(), z.unknown()).superRefine((meta, ctx) => {
  const curation = meta[QUICKDEPLOY_REGISTRY_CURATION_META_KEY];
  if (curation !== undefined) {
    const parsed = QuickDeployRegistryCurationSchema.safeParse(curation);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          ...issue,
          path: [QUICKDEPLOY_REGISTRY_CURATION_META_KEY, ...issue.path],
        });
      }
    }
  }
});
export type ServerJsonMeta = z.infer<typeof ServerJsonMetaSchema>;

export const OfficialServerJsonDocumentSchema = z
  .object({
    $schema: z.string().optional(),
    name: z.string().min(1),
    version: z.string().min(1).optional(),
    description: z.string().optional(),
    packages: z.array(ServerJsonPackageSchema).optional(),
    remotes: z.array(ServerJsonRemoteSchema).optional(),
    environmentVariables: z.array(ServerJsonEnvironmentVariableSchema).optional(),
    _meta: ServerJsonMetaSchema.optional(),
  })
  .catchall(z.unknown())
  .superRefine((server, ctx) => {
    const schemaVintage = extractOfficialServerJsonSchemaVintage(server.$schema);
    if (server.$schema && !schemaVintage) {
      ctx.addIssue({
        code: "custom",
        path: ["$schema"],
        message: "Unsupported server.json schema vintage; expected 2025-09-29 or 2025-12-11.",
      });
    }

    for (const key of Object.keys(server)) {
      if (QUICKDEPLOY_TOP_LEVEL_FIELDS.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "QuickDeploy registry curation belongs under reverse-DNS _meta keys.",
        });
      }
    }
  });
export type OfficialServerJsonDocument = z.infer<typeof OfficialServerJsonDocumentSchema>;

export const ServersJsonEnvelopeSchema = z.object({
  $schema: z.string().optional(),
  generatedAt: z.string().optional(),
  servers: z.array(OfficialServerJsonDocumentSchema).default([]),
  _meta: z.record(z.string(), z.unknown()).optional(),
});
export type ServersJsonEnvelope = z.infer<typeof ServersJsonEnvelopeSchema>;

export const ServersJsonSchema = z.union([
  z.array(OfficialServerJsonDocumentSchema),
  ServersJsonEnvelopeSchema,
]);
export type ServersJson = z.infer<typeof ServersJsonSchema>;

export type ServerJsonEntryKind = "packages-based" | "manifest-backed" | "remotes-only";

export function serverJsonEntries(doc: ServersJson): OfficialServerJsonDocument[] {
  return Array.isArray(doc) ? doc : doc.servers;
}

export function hasQuickDeployManifest(server: OfficialServerJsonDocument): boolean {
  return server._meta?.[QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY] !== undefined;
}

export function serverJsonEntryKinds(server: OfficialServerJsonDocument): ServerJsonEntryKind[] {
  const kinds: ServerJsonEntryKind[] = [];
  if ((server.packages?.length ?? 0) > 0) kinds.push("packages-based");
  if (hasQuickDeployManifest(server)) kinds.push("manifest-backed");
  if ((server.remotes?.length ?? 0) > 0 && (server.packages?.length ?? 0) === 0) {
    kinds.push("remotes-only");
  }
  return kinds;
}

export function quickDeployRegistryCuration(
  server: OfficialServerJsonDocument,
): QuickDeployRegistryCuration | null {
  const curation = server._meta?.[QUICKDEPLOY_REGISTRY_CURATION_META_KEY];
  if (curation === undefined) return null;
  return QuickDeployRegistryCurationSchema.parse(curation);
}
