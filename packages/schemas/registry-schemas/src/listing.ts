import { z } from "zod";
import { CapabilityTypeSchema } from "./capability.js";

/**
 * Where a listing's capability comes from:
 *   internal — references an existing catalog id (e.g. an mcp server_name)
 *   url      — references an external source by URL (agent card, server.json, repo)
 *   zip      — an uploaded archive
 *   mcpb     — an uploaded MCP bundle
 */
export const SourceKindSchema = z.enum(["internal", "url", "zip", "mcpb"]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const RegistryOwnerTypeSchema = z.enum(["personal", "team", "enterprise"]);
export type RegistryOwnerType = z.infer<typeof RegistryOwnerTypeSchema>;

export const RegistryVisibilitySchema = z.enum(["private", "unlisted", "public"]);
export type RegistryVisibility = z.infer<typeof RegistryVisibilitySchema>;

/** A registry row as returned by the registries edge function. */
export const RegistrySchema = z.object({
  id: z.string(),
  ownerType: RegistryOwnerTypeSchema,
  ownerProfileId: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  iconEmoji: z.string().nullable().optional(),
  visibility: RegistryVisibilitySchema,
  isDefault: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Registry = z.infer<typeof RegistrySchema>;

/** A capability listed inside a registry. */
export const RegistryListingSchema = z.object({
  id: z.string(),
  registryId: z.string(),
  protocol: CapabilityTypeSchema,
  subtype: z.string().nullable().optional(),
  sourceKind: SourceKindSchema,
  internalRef: z.string().nullable().optional(),
  sourceRef: z.string().nullable().optional(),
  name: z.string(),
  publisher: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  inferred: z.record(z.string(), z.unknown()).default({}),
  manual: z.record(z.string(), z.unknown()).default({}),
  manifest: z.record(z.string(), z.unknown()).default({}),
  isListed: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type RegistryListing = z.infer<typeof RegistryListingSchema>;

export const RegistryFavoriteSchema = z.object({
  id: z.string(),
  ownerProfileId: z.string(),
  targetKind: z.enum(["registry", "listing"]),
  registryId: z.string().nullable().optional(),
  listingId: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});
export type RegistryFavorite = z.infer<typeof RegistryFavoriteSchema>;

export const ActorSearchSourceSchema = z.object({
  registryId: z.string(),
  enabled: z.boolean(),
});
export type ActorSearchSource = z.infer<typeof ActorSearchSourceSchema>;

// ── Edge-function request DTOs ───────────────────────────────────────────────

export const CreateRegistryInputSchema = z.object({
  ownerType: RegistryOwnerTypeSchema,
  ownerProfileId: z.string(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(64).optional(),
  description: z.string().max(2000).optional(),
  iconEmoji: z.string().max(16).optional(),
  visibility: RegistryVisibilitySchema.default("private"),
});
export type CreateRegistryInput = z.infer<typeof CreateRegistryInputSchema>;

export const AddListingInputSchema = z.object({
  registryId: z.string(),
  protocol: CapabilityTypeSchema,
  subtype: z.string().optional(),
  sourceKind: SourceKindSchema,
  internalRef: z.string().optional(),
  sourceRef: z.string().url().optional(),
  name: z.string().min(1).max(200),
  publisher: z.string().max(200).optional(),
  version: z.string().max(64).optional(),
  description: z.string().max(4000).optional(),
  inferred: z.record(z.string(), z.unknown()).optional(),
  manual: z.record(z.string(), z.unknown()).optional(),
  manifest: z.record(z.string(), z.unknown()).optional(),
  isListed: z.boolean().default(true),
});
export type AddListingInput = z.infer<typeof AddListingInputSchema>;
