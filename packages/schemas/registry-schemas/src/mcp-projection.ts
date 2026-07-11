import { z } from "zod";

import {
  McpManifestAuthSchema,
  McpManifestConfigSchema,
  McpManifestDeploymentSchema,
  McpManifestExposeSchema,
  McpManifestSelectSchema,
} from "./mcp-manifest.js";

export const MCP_PROJECTION_CONFIG_KIND = "McpProjectionConfig" as const;

const ArdEntryRefSchema = z
  .string()
  .min(1)
  .regex(/^urn:air:[A-Za-z0-9][A-Za-z0-9:._-]*$/, "entryRef must be an ARD urn:air");

export const McpProjectionConfigSchema = z
  .object({
    kind: z.literal(MCP_PROJECTION_CONFIG_KIND).optional(),
    entryRef: ArdEntryRefSchema,
    importerVersionRange: z.string().min(1).default("^0.1.0"),
    select: McpManifestSelectSchema.optional(),
    expose: McpManifestExposeSchema.default({
      tools: [],
      resources: [],
      prompts: [],
    }),
    auth: z.array(McpManifestAuthSchema).default([]),
    config: McpManifestConfigSchema.optional(),
    deployment: McpManifestDeploymentSchema,
  })
  .strict();

export type McpProjectionConfig = z.infer<typeof McpProjectionConfigSchema>;
