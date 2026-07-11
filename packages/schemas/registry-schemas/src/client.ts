import type { CapabilityType } from "./capability.js";
import type {
  ActorSearchSource,
  AddListingInput,
  CreateRegistryInput,
  Registry,
  RegistryFavorite,
  RegistryListing,
  SourceKind,
} from "./listing.js";
import type { InferenceResult } from "./inference.js";

/**
 * Transport adapter. Apps wire this to `supabase.functions.invoke("registries",
 * { body: { action, ...payload }, headers })` and return the parsed JSON body
 * (throwing on transport/`error`). Keeping the transport injectable makes the
 * client trivially unit-testable.
 */
export type RegistriesInvoke = (
  action: string,
  payload: Record<string, unknown>,
  headers?: Record<string, string>,
) => Promise<Record<string, unknown>>;

export interface RegistriesClientOptions {
  /** The active actor (profile) id, sent as the X-Actor-Id header. */
  actorProfileId?: string | null;
}

function headersFor(opts: RegistriesClientOptions | undefined): Record<string, string> {
  return opts?.actorProfileId ? { "X-Actor-Id": opts.actorProfileId } : {};
}

export interface InferResult {
  success: boolean;
  inferred?: InferenceResult;
  blockers?: string[];
}

export function createRegistriesClient(invoke: RegistriesInvoke, opts?: RegistriesClientOptions) {
  const h = () => headersFor(opts);
  return {
    // Registries
    async listRegistries(ownerProfileId?: string): Promise<Registry[]> {
      const res = await invoke("listRegistries", { ownerProfileId }, h());
      return (res.registries as Registry[]) ?? [];
    },
    async getRegistry(id: string): Promise<Registry | null> {
      const res = await invoke("getRegistry", { id }, h());
      return (res.registry as Registry) ?? null;
    },
    async ensureDefaultRegistry(ownerProfileId: string): Promise<Registry> {
      const res = await invoke("ensureDefaultRegistry", { ownerProfileId }, h());
      return res.registry as Registry;
    },
    async createRegistry(input: CreateRegistryInput): Promise<Registry> {
      const res = await invoke("createRegistry", { ...input }, h());
      return res.registry as Registry;
    },
    async updateRegistry(id: string, patch: Partial<CreateRegistryInput>): Promise<Registry> {
      const res = await invoke("updateRegistry", { id, patch }, h());
      return res.registry as Registry;
    },
    async deleteRegistry(id: string): Promise<boolean> {
      const res = await invoke("deleteRegistry", { id }, h());
      return Boolean(res.success);
    },

    // Listings
    async listListings(registryId: string, protocol?: CapabilityType): Promise<RegistryListing[]> {
      const res = await invoke("listListings", { registryId, protocol }, h());
      return (res.listings as RegistryListing[]) ?? [];
    },
    async addListing(input: AddListingInput): Promise<RegistryListing> {
      const res = await invoke("addListing", { ...input }, h());
      return res.listing as RegistryListing;
    },
    async updateListing(id: string, patch: Partial<AddListingInput>): Promise<RegistryListing> {
      const res = await invoke("updateListing", { id, patch }, h());
      return res.listing as RegistryListing;
    },
    async removeListing(id: string): Promise<boolean> {
      const res = await invoke("removeListing", { id }, h());
      return Boolean(res.success);
    },
    async setListed(id: string, isListed: boolean): Promise<RegistryListing> {
      const res = await invoke("setListed", { id, isListed }, h());
      return res.listing as RegistryListing;
    },

    // Favorites
    async favorite(args: {
      ownerProfileId: string;
      targetKind: "registry" | "listing";
      registryId?: string;
      listingId?: string;
    }): Promise<RegistryFavorite> {
      const res = await invoke("favorite", { ...args }, h());
      return res.favorite as RegistryFavorite;
    },
    async unfavorite(args: {
      ownerProfileId: string;
      registryId?: string;
      listingId?: string;
    }): Promise<boolean> {
      const res = await invoke("unfavorite", { ...args }, h());
      return Boolean(res.success);
    },
    async listFavorites(ownerProfileId: string): Promise<RegistryFavorite[]> {
      const res = await invoke("listFavorites", { ownerProfileId }, h());
      return (res.favorites as RegistryFavorite[]) ?? [];
    },

    // Search sources
    async listSearchSources(actorProfileId: string): Promise<ActorSearchSource[]> {
      const res = await invoke("listSearchSources", { actorProfileId }, h());
      return (res.sources as ActorSearchSource[]) ?? [];
    },
    async setSearchSource(
      actorProfileId: string,
      registryId: string,
      enabled: boolean,
    ): Promise<boolean> {
      const res = await invoke("setSearchSource", { actorProfileId, registryId, enabled }, h());
      return Boolean(res.success);
    },

    // Guided upload / inference (parse only)
    async inferFromManifest(args: {
      protocol: CapabilityType;
      sourceKind: SourceKind;
      sourceRef?: string;
      rawManifest?: unknown;
    }): Promise<InferResult> {
      const res = await invoke("inferFromManifest", { ...args }, h());
      return res as unknown as InferResult;
    },
  };
}

export type RegistriesClient = ReturnType<typeof createRegistriesClient>;
