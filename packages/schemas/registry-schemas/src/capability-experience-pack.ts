import { z } from "zod";
import { CapabilityTypeSchema, type CapabilityType } from "./capability.js";

/**
 * Chat-native capability experience packs (QUI-62).
 *
 * OpenAI Apps SDK-style hosts and other embedded agent surfaces (voice
 * assistants, chat widgets) want to render a capability inline, without
 * sending the user to the QDAI marketplace. This module is the portable,
 * host-neutral contract for that export: one honest evidence manifest,
 * plus a rendering variant per constrained host that declares exactly which
 * governance fields it shows, hides, or abbreviates.
 *
 * Runtime-agnostic (no I/O) so the marketplace app, account-hub, and the
 * Deno edge functions can all build and validate the same shape. The
 * marketplace-specific builder that maps a `CapabilityTrustPassport` +
 * compatibility matrix into the input this module expects lives in
 * `apps/quick-deploy-marketplace/src/lib/capability-experience-pack.ts`.
 */

export const CAPABILITY_EXPERIENCE_PACK_SCHEMA = "qdai.capability-experience-pack.v1";

// ── Evidence honesty ─────────────────────────────────────────────────────────

/**
 * How the pack's safe-test/deployment claim was actually produced.
 * `live-e2e` requires a real provider/deployment proof; `mocked-ui` is UI-only
 * evidence (recorded, not a live deployment); `unverified` means neither has
 * run yet. Ordered weakest-to-strongest for {@link resolveEvidenceMode}.
 */
export const CapabilityExperienceEvidenceModeSchema = z.enum([
  "unverified",
  "mocked-ui",
  "live-e2e",
]);
export type CapabilityExperienceEvidenceMode = z.infer<
  typeof CapabilityExperienceEvidenceModeSchema
>;

const EVIDENCE_MODE_RANK: Record<CapabilityExperienceEvidenceMode, number> = {
  unverified: 0,
  "mocked-ui": 1,
  "live-e2e": 2,
};

/**
 * Resolve the evidence mode a pack is allowed to claim. A caller can request
 * `live-e2e`, but that claim only survives when the underlying safe test
 * actually passed — otherwise the claim is downgraded to `mocked-ui`. This is
 * the single enforcement point for "never claims live-e2e when host or
 * provider paths are mocked" (QUI-62 acceptance criteria); every pack and
 * every host rendering derives its evidence mode from this function instead
 * of setting one independently, so there is no path that can inflate it.
 */
export function resolveEvidenceMode(
  claimed: CapabilityExperienceEvidenceMode,
  safeTestResult: "passed" | "not-run" | "requires-review",
): CapabilityExperienceEvidenceMode {
  if (claimed === "live-e2e" && safeTestResult !== "passed") return "mocked-ui";
  return claimed;
}

export function evidenceModeAtLeast(
  mode: CapabilityExperienceEvidenceMode,
  minimum: CapabilityExperienceEvidenceMode,
): boolean {
  return EVIDENCE_MODE_RANK[mode] >= EVIDENCE_MODE_RANK[minimum];
}

// ── Governance fields ────────────────────────────────────────────────────────

/**
 * The governance surface every experience pack carries (QUI-62 "Proposed
 * experience" list). A host rendering declares each field visible, hidden, or
 * abbreviated — never silently dropped.
 */
export const CapabilityExperienceGovernanceFieldSchema = z.enum([
  "capability-promise",
  "access-boundary",
  "safe-test-status",
  "cost-boundary",
  "monitoring-link",
  "control-path",
  "publisher-identity",
  "review-status",
]);
export type CapabilityExperienceGovernanceField = z.infer<
  typeof CapabilityExperienceGovernanceFieldSchema
>;

export const GOVERNANCE_FIELDS = CapabilityExperienceGovernanceFieldSchema.options;

export const GOVERNANCE_FIELD_LABELS: Record<CapabilityExperienceGovernanceField, string> = {
  "capability-promise": "Capability promise and business outcome",
  "access-boundary": "Required access and credential boundary",
  "safe-test-status": "Safe-test status and latest evidence",
  "cost-boundary": "Cost estimate or billing boundary",
  "monitoring-link": "Monitoring link or status summary",
  "control-path": "Pause, disable, rollback, or change path",
  "publisher-identity": "Publisher/support identity and review status",
  "review-status": "Review status and placement",
};

// ── Evidence manifest (host-neutral) ─────────────────────────────────────────

export const CapabilityExperiencePublisherSchema = z.object({
  name: z.string(),
  verified: z.boolean().default(false),
  supportModel: z.string(),
});
export type CapabilityExperiencePublisher = z.infer<typeof CapabilityExperiencePublisherSchema>;

export const CapabilityExperienceReviewStatusSchema = z.object({
  state: z.enum(["ready", "needs-review", "blocked"]),
  label: z.string(),
});
export type CapabilityExperienceReviewStatus = z.infer<
  typeof CapabilityExperienceReviewStatusSchema
>;

export const CapabilityExperienceAccessBoundarySchema = z.object({
  scopes: z.array(z.string()).default([]),
  credentialModel: z.string(),
});
export type CapabilityExperienceAccessBoundary = z.infer<
  typeof CapabilityExperienceAccessBoundarySchema
>;

export const CapabilityExperienceSafeTestSchema = z.object({
  result: z.enum(["passed", "not-run", "requires-review"]),
  evidenceMode: CapabilityExperienceEvidenceModeSchema,
  evidencePath: z.string().optional(),
});
export type CapabilityExperienceSafeTest = z.infer<typeof CapabilityExperienceSafeTestSchema>;

export const CapabilityExperienceCostSchema = z.object({
  summary: z.string(),
  capUsd: z.number().nonnegative().optional(),
  period: z.string().optional(),
});
export type CapabilityExperienceCost = z.infer<typeof CapabilityExperienceCostSchema>;

export const CapabilityExperienceMonitoringSchema = z.object({
  summary: z.string(),
  link: z.string().optional(),
});
export type CapabilityExperienceMonitoring = z.infer<typeof CapabilityExperienceMonitoringSchema>;

export const CapabilityExperienceControlPathSchema = z.object({
  pause: z.string(),
  disable: z.string(),
  rollback: z.string(),
});
export type CapabilityExperienceControlPath = z.infer<typeof CapabilityExperienceControlPathSchema>;

export const CapabilityExperienceEvidenceManifestSchema = z.object({
  schema: z.literal("qdai.capability-experience-manifest.v1"),
  capabilityName: z.string(),
  capabilityType: CapabilityTypeSchema,
  capabilityPromise: z.string(),
  publisher: CapabilityExperiencePublisherSchema,
  reviewStatus: CapabilityExperienceReviewStatusSchema,
  access: CapabilityExperienceAccessBoundarySchema,
  safeTest: CapabilityExperienceSafeTestSchema,
  cost: CapabilityExperienceCostSchema,
  monitoring: CapabilityExperienceMonitoringSchema,
  controlPath: CapabilityExperienceControlPathSchema,
});
export type CapabilityExperienceEvidenceManifest = z.infer<
  typeof CapabilityExperienceEvidenceManifestSchema
>;

export interface CapabilityExperienceManifestInput {
  capabilityName: string;
  capabilityType: CapabilityType;
  capabilityPromise: string;
  publisher: CapabilityExperiencePublisher;
  reviewStatus: CapabilityExperienceReviewStatus;
  access: CapabilityExperienceAccessBoundary;
  safeTestResult: "passed" | "not-run" | "requires-review";
  /** The evidence mode the caller believes applies; downgraded if unsupported. */
  claimedEvidenceMode: CapabilityExperienceEvidenceMode;
  evidencePath?: string;
  cost: CapabilityExperienceCost;
  monitoring: CapabilityExperienceMonitoring;
  controlPath: CapabilityExperienceControlPath;
}

/**
 * Build the host-neutral evidence manifest. This is the one place an
 * experience pack's evidence claim is decided (via {@link resolveEvidenceMode}),
 * so every downstream host rendering inherits an honest claim instead of
 * asserting its own.
 */
export function buildCapabilityExperienceEvidenceManifest(
  input: CapabilityExperienceManifestInput,
): CapabilityExperienceEvidenceManifest {
  return {
    schema: "qdai.capability-experience-manifest.v1",
    capabilityName: input.capabilityName,
    capabilityType: input.capabilityType,
    capabilityPromise: input.capabilityPromise,
    publisher: input.publisher,
    reviewStatus: input.reviewStatus,
    access: input.access,
    safeTest: {
      result: input.safeTestResult,
      evidenceMode: resolveEvidenceMode(input.claimedEvidenceMode, input.safeTestResult),
      ...(input.evidencePath ? { evidencePath: input.evidencePath } : {}),
    },
    cost: input.cost,
    monitoring: input.monitoring,
    controlPath: input.controlPath,
  };
}

// ── Host rendering ───────────────────────────────────────────────────────────

export const CapabilityExperienceHostIdSchema = z.enum([
  "chatgpt-apps-sdk",
  "generic-embedded-host",
]);
export type CapabilityExperienceHostId = z.infer<typeof CapabilityExperienceHostIdSchema>;

export interface CapabilityExperienceHostProfile {
  id: CapabilityExperienceHostId;
  label: string;
  /** Governance fields this host's chrome can render inline. */
  visibleFields: readonly CapabilityExperienceGovernanceField[];
  /** How review status, publisher identity, and directory placement differ here. */
  placement: string;
}

/**
 * Known constrained hosts. `chatgpt-apps-sdk` models the Apps SDK / app
 * directory surface, which has room for the capability promise, safe-test
 * status, and control path inline but abbreviates the full access/cost
 * governance detail behind a fallback link and a directory review gate.
 * `generic-embedded-host` is the conservative default for an unmodeled
 * embedded surface: nothing is hidden, since the host's real constraints are
 * unknown.
 */
export const CAPABILITY_EXPERIENCE_HOSTS: readonly CapabilityExperienceHostProfile[] = [
  {
    id: "chatgpt-apps-sdk",
    label: "ChatGPT Apps SDK",
    visibleFields: ["capability-promise", "safe-test-status", "control-path", "review-status"],
    placement:
      "Subject to app directory review and featured-placement selection; publisher identity and support model surface through the directory listing, not the in-conversation card.",
  },
  {
    id: "generic-embedded-host",
    label: "Generic embedded agent host",
    visibleFields: GOVERNANCE_FIELDS,
    placement:
      "No directory review or featured placement is modeled for this host; treat it as a direct, unreviewed embed until the host's real constraints are known.",
  },
];

export const CapabilityExperienceHostRenderingSchema = z.object({
  hostId: CapabilityExperienceHostIdSchema,
  hostLabel: z.string(),
  compactSummary: z.string(),
  visibleFields: z.array(CapabilityExperienceGovernanceFieldSchema),
  hiddenFields: z.array(CapabilityExperienceGovernanceFieldSchema),
  /** Required whenever `hiddenFields` is non-empty — never hide without an escape hatch. */
  fallbackDetailUrl: z.string().optional(),
  requiresApprovalGate: z.boolean(),
  placement: z.string(),
});
export type CapabilityExperienceHostRendering = z.infer<
  typeof CapabilityExperienceHostRenderingSchema
>;

function compactSummary(
  manifest: CapabilityExperienceEvidenceManifest,
  visibleFields: readonly CapabilityExperienceGovernanceField[],
): string {
  const parts: string[] = [manifest.capabilityPromise];
  if (visibleFields.includes("safe-test-status")) {
    parts.push(`Safe test: ${manifest.safeTest.result} (${manifest.safeTest.evidenceMode}).`);
  }
  if (visibleFields.includes("access-boundary")) {
    parts.push(
      manifest.access.scopes.length
        ? `Access: ${manifest.access.scopes.join(", ")}.`
        : "Access: no scopes declared.",
    );
  }
  if (visibleFields.includes("cost-boundary")) {
    parts.push(manifest.cost.summary);
  }
  if (visibleFields.includes("control-path")) {
    parts.push(`Pause: ${manifest.controlPath.pause}`);
  }
  return parts.filter(Boolean).join(" ");
}

/**
 * Governance fields that must never be silently abbreviated behind a
 * directory review, regardless of host chrome constraints — a user must
 * always be able to stop or roll back a capability without leaving the
 * embedded surface (QUI-62: "without leaving the embedded surface").
 */
const ALWAYS_VISIBLE_FIELDS: readonly CapabilityExperienceGovernanceField[] = [
  "control-path",
  "safe-test-status",
];

export function buildCapabilityExperienceHostRendering(
  manifest: CapabilityExperienceEvidenceManifest,
  host: CapabilityExperienceHostProfile,
  fallbackDetailUrl?: string,
): CapabilityExperienceHostRendering {
  const visible = new Set<CapabilityExperienceGovernanceField>([
    ...host.visibleFields,
    ...ALWAYS_VISIBLE_FIELDS,
  ]);
  const visibleFields = GOVERNANCE_FIELDS.filter((field) => visible.has(field));
  const hiddenFields = GOVERNANCE_FIELDS.filter((field) => !visible.has(field));

  if (hiddenFields.length > 0 && !fallbackDetailUrl) {
    throw new Error(
      `Host "${host.id}" hides governance fields (${hiddenFields.join(", ")}) but no fallbackDetailUrl was provided.`,
    );
  }

  return {
    hostId: host.id,
    hostLabel: host.label,
    compactSummary: compactSummary(manifest, visibleFields),
    visibleFields,
    hiddenFields,
    ...(fallbackDetailUrl ? { fallbackDetailUrl } : {}),
    requiresApprovalGate: hiddenFields.length > 0,
    placement: host.placement,
  };
}

// ── Pack ─────────────────────────────────────────────────────────────────────

export const CapabilityExperiencePackSchema = z.object({
  schema: z.literal(CAPABILITY_EXPERIENCE_PACK_SCHEMA),
  generatedAt: z.string(),
  previewOnly: z.boolean(),
  evidenceManifest: CapabilityExperienceEvidenceManifestSchema,
  hostRenderings: z.array(CapabilityExperienceHostRenderingSchema).min(1),
});
export type CapabilityExperiencePack = z.infer<typeof CapabilityExperiencePackSchema>;

export interface CapabilityExperienceHostTarget {
  host: CapabilityExperienceHostProfile;
  fallbackDetailUrl?: string;
}

/**
 * Build a full capability experience pack: one host-neutral evidence
 * manifest plus one rendering per requested host. Defaults to previewing
 * every known host with a placeholder detail link so the pack is always
 * buildable before a real fallback URL exists; callers that need a specific
 * fallback link (e.g. the capability's own detail page) should pass targets
 * explicitly.
 */
export function buildCapabilityExperiencePack(
  manifest: CapabilityExperienceEvidenceManifest,
  targets: readonly CapabilityExperienceHostTarget[] = CAPABILITY_EXPERIENCE_HOSTS.map((host) => ({
    host,
  })),
  options: { generatedAt?: string; previewOnly?: boolean } = {},
): CapabilityExperiencePack {
  return {
    schema: CAPABILITY_EXPERIENCE_PACK_SCHEMA,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    previewOnly: options.previewOnly ?? true,
    evidenceManifest: manifest,
    hostRenderings: targets.map((target) =>
      buildCapabilityExperienceHostRendering(manifest, target.host, target.fallbackDetailUrl),
    ),
  };
}
