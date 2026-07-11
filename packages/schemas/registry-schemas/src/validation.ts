import { z } from "zod";
import { CapabilityTypeSchema } from "./capability.js";

/**
 * Capability validation pipeline — shared contracts + pure derivation.
 *
 * When a capability is uploaded/registered, or when the platform scans a central
 * registry, it is queued for a set of validation checks (quality, security,
 * evals, trust/identity, content-safety) plus a terminal policy gate. Each check
 * produces a ValidationCheckResult; the run aggregates them and the marketplace
 * renders the results as evidence-backed badges on the capability detail page.
 *
 * This module is the single source of truth for the data contracts and the pure
 * derivation logic (badges, run aggregation, evidence/scan mapping, the
 * publish-time policy gate). It is runtime-agnostic (no I/O) so it runs in the
 * browser (marketplace badges), in Node (the deployment-watcher orchestrator),
 * and in Deno (the validate-capability edge function) without duplication.
 *
 * Adapter-driven check execution (the SkillSpector scanner, the MCP-Trust
 * verifier, the OpenShell sandbox, the Azure Content Safety inspector) lives in
 * each runtime against the result shapes declared here. See
 * apps/deployment-watcher/src/lib/capability-validation.ts and
 * supabase/functions/validate-capability/.
 */

// ── Protocol ─────────────────────────────────────────────────────────────────

/** Capability protocols plus `custom`, matching the governance CapabilityProtocol. */
export const ValidationProtocolSchema = z.enum([...CapabilityTypeSchema.options, "custom"]);
export type ValidationProtocol = z.infer<typeof ValidationProtocolSchema>;

// ── Core enums ───────────────────────────────────────────────────────────────

export const ValidationCheckCategorySchema = z.enum([
  "quality",
  "security",
  "evals",
  "trust",
  "content-safety",
  "policy-gate",
]);
export type ValidationCheckCategory = z.infer<typeof ValidationCheckCategorySchema>;

/** All check categories as a readonly tuple. */
export const VALIDATION_CHECK_CATEGORIES = ValidationCheckCategorySchema.options;

/**
 * Check + run lifecycle statuses. Superset of the governance CapabilityScanStatus
 * — adds the saga lifecycle states queued/running/skipped/error.
 */
export const ValidationStatusSchema = z.enum([
  "queued",
  "running",
  "passed",
  "failed",
  "requires-review",
  "error",
  "not-run",
  "skipped",
]);
export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;

export const ValidationSeveritySchema = z.enum(["info", "low", "medium", "high", "critical"]);
export type ValidationSeverity = z.infer<typeof ValidationSeveritySchema>;

export const ValidationSourceSchema = z.enum([
  "user-publish",
  "central-scan",
  "registry-cqrs",
  "scheduled",
]);
export type ValidationSource = z.infer<typeof ValidationSourceSchema>;

export const ValidationDecisionSchema = z.enum(["allow", "requires_approval", "deny"]);
export type ValidationDecision = z.infer<typeof ValidationDecisionSchema>;

/** Mirrors the governance CapabilityScanStatus (the SkillSpector scan posture). */
export const CapabilityScanStatusSchema = z.enum([
  "passed",
  "requires-review",
  "failed",
  "not-run",
  "unknown",
]);
export type CapabilityScanStatus = z.infer<typeof CapabilityScanStatusSchema>;

export const ValidationCapabilityKindSchema = z.enum([
  "api-contract",
  "tool",
  "provider",
  "resource",
  "prompt",
  "event",
  "workflow",
  "agent",
  "skill",
  "task",
]);
export type ValidationCapabilityKind = z.infer<typeof ValidationCapabilityKindSchema>;

// ── Result + run + badge schemas ─────────────────────────────────────────────

export const ValidationFindingSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type ValidationFinding = z.infer<typeof ValidationFindingSchema>;

export const ValidationCheckResultSchema = z.object({
  category: ValidationCheckCategorySchema,
  /** Derived capability kinds this check result covers; null/omitted means whole-capability. */
  capabilityKinds: z.array(ValidationCapabilityKindSchema).nullable().optional(),
  /** Adapter/check id, e.g. "skillspector", "mcp-trust", "native-quality". */
  checkId: z.string(),
  status: ValidationStatusSchema,
  severity: ValidationSeveritySchema.optional(),
  /** Risk score (security) or normalized trust score, 0..100. */
  score: z.number().min(0).max(100).optional(),
  summary: z.string().default(""),
  /** SARIF / provider-native report reference for CI + audit. */
  reportRef: z.string().optional(),
  /** The evidence-ladder rung this check feeds (1..8), when it owns one. */
  evidenceLevel: z.number().int().min(1).max(8).optional(),
  findings: z.array(ValidationFindingSchema).default([]),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});
export type ValidationCheckResult = z.infer<typeof ValidationCheckResultSchema>;

export const ValidationRunSchema = z.object({
  runId: z.string(),
  capabilityKey: z.string(),
  /** Derived capability kinds covered by this run; null/omitted means whole-capability. */
  capabilityKinds: z.array(ValidationCapabilityKindSchema).nullable().optional(),
  version: z.string().default(""),
  protocol: ValidationProtocolSchema,
  source: ValidationSourceSchema,
  /** Aggregated run status (see aggregateRunStatus). */
  status: ValidationStatusSchema,
  results: z.array(ValidationCheckResultSchema).default([]),
  /** Stable fingerprint of the policy the gate evaluated against. */
  policyHash: z.string().optional(),
  decision: ValidationDecisionSchema.optional(),
  triggeredBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ValidationRun = z.infer<typeof ValidationRunSchema>;

export const BadgeVariantSchema = z.enum([
  "success",
  "warning",
  "destructive",
  "secondary",
  "outline",
]);
export type BadgeVariant = z.infer<typeof BadgeVariantSchema>;

export const BadgeToneSchema = z.enum(["passed", "review", "failed", "pending", "skipped"]);
export type BadgeTone = z.infer<typeof BadgeToneSchema>;

export const CapabilityBadgeSchema = z.object({
  /** "security" | "trust" | … | "overall". */
  id: z.string(),
  /** Derived capability kinds this badge covers; null/omitted means whole-capability. */
  capabilityKinds: z.array(ValidationCapabilityKindSchema).nullable().optional(),
  category: z.union([ValidationCheckCategorySchema, z.literal("overall")]),
  label: z.string(),
  status: ValidationStatusSchema,
  variant: BadgeVariantSchema,
  tone: BadgeToneSchema,
  detail: z.string().optional(),
});
export type CapabilityBadge = z.infer<typeof CapabilityBadgeSchema>;

export const CapabilityBadgesSchema = z.object({
  capabilityKey: z.string(),
  runStatus: ValidationStatusSchema,
  badges: z.array(CapabilityBadgeSchema),
  validatedAt: z.string().optional(),
});
export type CapabilityBadges = z.infer<typeof CapabilityBadgesSchema>;

/**
 * Evidence about a capability assembled from check results, structurally
 * compatible with the governance CapabilityEvidence so it can be passed to
 * evaluateCapabilityPolicy / evaluateValidationGate.
 */
export interface ValidationEvidence {
  trustLevel?: number;
  scanStatus?: CapabilityScanStatus;
  /** SkillSpector risk score, 0..100 (lower is safer). */
  riskScore?: number;
  /** MCP-Trust score normalized to 0..100 (raw 0..1000 / 10). */
  mcpTrustScore?: number;
  digestChanged?: boolean;
}

/** SkillSpector-style scan result, matching capability-scan-signal's input shape. */
export interface CapabilityStaticScanResultShape {
  riskScore: number;
  summary?: string;
  scannedAt?: string;
  reportRef?: string;
  status?: CapabilityScanStatus;
  scannerId?: string;
}

// ── Risk banding (shared with capability-scan-signal) ────────────────────────

export type ScanRiskBand = "low" | "medium" | "high" | "critical";

/** SkillSpector risk banding (0-20 low, 21-50 medium, 51-80 high, 81-100 critical). */
export function riskScoreToBand(score: number): ScanRiskBand {
  const clamped = Math.max(0, Math.min(100, score));
  if (clamped <= 20) return "low";
  if (clamped <= 50) return "medium";
  if (clamped <= 80) return "high";
  return "critical";
}

/** Short letter grade for the at-a-glance trust UI. */
export function riskScoreToGrade(score: number): string {
  switch (riskScoreToBand(score)) {
    case "low":
      return "A";
    case "medium":
      return "B";
    case "high":
      return "D";
    default:
      return "F";
  }
}

/** Low risk passes, medium needs review, high/critical fail. */
export function riskScoreToScanStatus(score: number): CapabilityScanStatus {
  switch (riskScoreToBand(score)) {
    case "low":
      return "passed";
    case "medium":
      return "requires-review";
    default:
      return "failed";
  }
}

/** Map a scan status to the validation lifecycle status used by check results. */
export function scanStatusToValidationStatus(status: CapabilityScanStatus): ValidationStatus {
  switch (status) {
    case "passed":
      return "passed";
    case "requires-review":
      return "requires-review";
    case "failed":
      return "failed";
    case "unknown":
      return "error";
    default:
      return "not-run";
  }
}

/** Map a risk band to a finding severity. */
export function bandToSeverity(band: ScanRiskBand): ValidationSeverity {
  switch (band) {
    case "low":
      return "info";
    case "medium":
      return "medium";
    case "high":
      return "high";
    default:
      return "critical";
  }
}

/** Pure rug-pull check: the manifest digest changed since registration. */
export function detectDigestChange(
  registeredDigest: string | undefined,
  observedDigest: string | undefined,
): boolean {
  if (!registeredDigest || !observedDigest) return false;
  return registeredDigest !== observedDigest;
}

// ── Discovery evidence-scope filters (QUI-65) ───────────────────────────────

/**
 * Compact, discovery-facing evidence tiers for marketplace search/filter
 * controls — a coarser, action-led vocabulary than the 8-level trust-passport
 * ladder (see apps/quick-deploy-marketplace/docs/trust-evidence-ladder.md and
 * the capability_evidence_tiers RPC in
 * apps/quick-deploy-marketplace/supabase/migrations/20260706210000_capability_evidence_tiers.sql,
 * which is the single source of truth for how a capability resolves to one of
 * these tiers). A capability only ever reports one tier: the strongest true
 * fact, so a filter can never upgrade a weaker signal (a static scan) into a
 * stronger claim (live provider proof).
 */
export const EvidenceScopeSchema = z.enum([
  "untested",
  "static-checked",
  "package-checked",
  "safe-test-passed",
  "live-provider-proof",
  "policy-approved",
  "failing",
  "stale",
  "needs-review",
]);
export type EvidenceScope = z.infer<typeof EvidenceScopeSchema>;

/** Canonical display order for evidence-scope filter controls. */
export const EVIDENCE_SCOPE_ORDER: EvidenceScope[] = [
  "untested",
  "static-checked",
  "package-checked",
  "safe-test-passed",
  "live-provider-proof",
  "policy-approved",
  "failing",
  "stale",
  "needs-review",
];

export const EVIDENCE_SCOPE_LABELS: Record<EvidenceScope, string> = {
  untested: "Untested",
  "static-checked": "Static/source checked",
  "package-checked": "Package/audit checked",
  "safe-test-passed": "QDAI safe-test passed",
  "live-provider-proof": "Live provider proof",
  "policy-approved": "Policy approved",
  failing: "Failing",
  stale: "Stale",
  "needs-review": "Needs review",
};

/** Badge styling for the compact per-card evidence indicator. */
export const EVIDENCE_SCOPE_VARIANT: Record<EvidenceScope, BadgeVariant> = {
  untested: "outline",
  "static-checked": "secondary",
  "package-checked": "secondary",
  "safe-test-passed": "success",
  "live-provider-proof": "success",
  "policy-approved": "success",
  failing: "destructive",
  stale: "warning",
  "needs-review": "warning",
};

// ── Evidence-ladder mapping ──────────────────────────────────────────────────

/**
 * The trust-passport evidence-ladder rung a check category owns, if any. Only
 * security (L4 automated scan), evals (L5 safe-test), and policy-gate (L6 admin
 * policy) light a rung directly. quality/trust/content-safety feed the review
 * scorecard and policy inputs instead, so they intentionally return undefined to
 * avoid double-lighting the ladder.
 */
export function categoryToEvidenceLevel(category: ValidationCheckCategory): number | undefined {
  switch (category) {
    case "security":
      return 4;
    case "evals":
      return 5;
    case "policy-gate":
      return 6;
    default:
      return undefined;
  }
}

// ── Run aggregation ──────────────────────────────────────────────────────────

/** Statuses ignored when folding results into a run status. */
const IGNORED_RUN_STATUSES = new Set<ValidationStatus>(["not-run", "skipped"]);

/** Most-severe-wins precedence for the aggregate run status. */
const RUN_STATUS_PRECEDENCE: ValidationStatus[] = [
  "failed",
  "requires-review",
  "error",
  "running",
  "queued",
  "passed",
];

/**
 * Fold N check results into a single run status: the most severe non-ignored
 * status wins. If every result is not-run/skipped (or there are none), the run
 * is "not-run".
 */
export function aggregateRunStatus(results: ValidationCheckResult[]): ValidationStatus {
  const present = new Set(results.map((r) => r.status).filter((s) => !IGNORED_RUN_STATUSES.has(s)));
  if (present.size === 0) return "not-run";
  for (const status of RUN_STATUS_PRECEDENCE) {
    if (present.has(status)) return status;
  }
  return "not-run";
}

// ── Evidence + scan derivation ───────────────────────────────────────────────

/**
 * Assemble evidence from completed check results. Security feeds
 * scanStatus/riskScore, trust feeds mcpTrustScore/digestChanged, and the highest
 * evidence-ladder rung that *passed* sets trustLevel. Used as the input to the
 * publish-time policy gate and to light the trust-passport ladder.
 */
export function resultsToValidationEvidence(results: ValidationCheckResult[]): ValidationEvidence {
  const evidence: ValidationEvidence = {};
  let highestRung = 0;

  for (const result of results) {
    // A score is only meaningful for a check that actually ran to a verdict;
    // a not-run/skipped/error check must not contribute a misleading 0.
    const ran =
      result.status === "passed" ||
      result.status === "failed" ||
      result.status === "requires-review";

    if (result.category === "security") {
      evidence.scanStatus = validationStatusToScanStatus(result.status);
      if (ran && typeof result.score === "number") evidence.riskScore = result.score;
    }
    if (result.category === "trust") {
      if (ran && typeof result.score === "number") evidence.mcpTrustScore = result.score;
      if (result.findings.some((f) => f.code === "trust.digest_changed")) {
        evidence.digestChanged = true;
      }
    }
    if (result.status === "passed") {
      const rung = categoryToEvidenceLevel(result.category);
      if (rung && rung > highestRung) highestRung = rung;
    }
  }

  if (highestRung > 0) evidence.trustLevel = highestRung;
  return evidence;
}

/** Inverse of scanStatusToValidationStatus for the security check result. */
export function validationStatusToScanStatus(status: ValidationStatus): CapabilityScanStatus {
  switch (status) {
    case "passed":
      return "passed";
    case "requires-review":
      return "requires-review";
    case "failed":
      return "failed";
    case "error":
      return "unknown";
    case "not-run":
    case "skipped":
      return "not-run";
    default:
      return "unknown";
  }
}

/**
 * Extract the security check into the capability-scan-signal input shape so the
 * marketplace can feed it through withStaticScanSignal and light passport L4.
 * Returns null when no security check ran.
 */
export function resultsToStaticScanResult(
  results: ValidationCheckResult[],
): CapabilityStaticScanResultShape | null {
  const security = results.find((r) => r.category === "security");
  if (!security || security.status === "not-run" || security.status === "skipped") return null;
  return {
    riskScore: typeof security.score === "number" ? security.score : 0,
    ...(security.summary ? { summary: security.summary } : {}),
    ...(security.completedAt ? { scannedAt: security.completedAt } : {}),
    ...(security.reportRef ? { reportRef: security.reportRef } : {}),
    status: validationStatusToScanStatus(security.status),
    scannerId: security.checkId,
  };
}

// ── Badge derivation ─────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<ValidationStatus, BadgeVariant> = {
  passed: "success",
  failed: "destructive",
  "requires-review": "warning",
  error: "destructive",
  running: "secondary",
  queued: "secondary",
  "not-run": "outline",
  skipped: "outline",
};

const STATUS_TONE: Record<ValidationStatus, BadgeTone> = {
  passed: "passed",
  failed: "failed",
  "requires-review": "review",
  error: "failed",
  running: "pending",
  queued: "pending",
  "not-run": "skipped",
  skipped: "skipped",
};

const CATEGORY_PASSED_LABEL: Record<ValidationCheckCategory, string> = {
  quality: "Quality reviewed",
  security: "Scanned",
  evals: "Safe-test passed",
  trust: "Identity verified",
  "content-safety": "Content-safe",
  "policy-gate": "Policy cleared",
};

const CATEGORY_BASE_LABEL: Record<ValidationCheckCategory, string> = {
  quality: "Quality",
  security: "Security",
  evals: "Evals",
  trust: "Trust",
  "content-safety": "Content safety",
  "policy-gate": "Policy",
};

/** Human label for a single badge from its category + status. */
export function badgeLabel(category: ValidationCheckCategory, status: ValidationStatus): string {
  const base = CATEGORY_BASE_LABEL[category];
  switch (status) {
    case "passed":
      return CATEGORY_PASSED_LABEL[category];
    case "failed":
      return `${base}: failed`;
    case "requires-review":
      return `${base}: review`;
    case "error":
      return `${base}: error`;
    case "running":
    case "queued":
      return `${base}: validating…`;
    default:
      return `${base}: not run`;
  }
}

/** Derive a single badge from a check result. */
export function deriveBadge(result: ValidationCheckResult): CapabilityBadge {
  return {
    id: result.category,
    capabilityKinds: result.capabilityKinds,
    category: result.category,
    label: badgeLabel(result.category, result.status),
    status: result.status,
    variant: STATUS_VARIANT[result.status],
    tone: STATUS_TONE[result.status],
    detail: result.summary || undefined,
  };
}

/** Label for the synthetic "overall" badge from the aggregate run status. */
export function overallBadgeLabel(status: ValidationStatus): string {
  switch (status) {
    case "passed":
      return "Validated";
    case "failed":
      return "Validation failed";
    case "requires-review":
      return "In review";
    case "error":
      return "Validation error";
    case "running":
    case "queued":
      return "Validating…";
    default:
      return "Not validated";
  }
}

/**
 * Derive the ordered badge list for a run: one badge per check result (in a
 * stable category order) plus a leading synthetic "overall" badge.
 */
export function deriveBadges(run: ValidationRun): CapabilityBadge[] {
  const overall: CapabilityBadge = {
    id: "overall",
    capabilityKinds: run.capabilityKinds,
    category: "overall",
    label: overallBadgeLabel(run.status),
    status: run.status,
    variant: STATUS_VARIANT[run.status],
    tone: STATUS_TONE[run.status],
    detail: run.decision ? `Policy decision: ${run.decision}` : undefined,
  };

  const byCategory = new Map(run.results.map((r) => [r.category, r]));
  const ordered = VALIDATION_CHECK_CATEGORIES.map((category) => byCategory.get(category)).filter(
    (r): r is ValidationCheckResult => Boolean(r),
  );

  return [overall, ...ordered.map(deriveBadge)];
}

// ── Publish-time policy gate ─────────────────────────────────────────────────

const MCP_PROTOCOLS = new Set<ValidationProtocol>(["mcp", "mcp-apps"]);

export type ScanGate = "passed" | "requires-review" | "any";
export type DigestChangeAction = "block" | "require_review" | "allow";

/**
 * The publish-time subset of CapabilityPolicy the validation gate enforces. The
 * runtime invocation gates (network egress, scopes, rate limits, budget,
 * approval triggers) live in evaluateCapabilityPolicy and are not checked here —
 * validation gates only on the evidence collected at publish time.
 */
export interface ValidationGatePolicy {
  requiredTrustLevel: number;
  requiredScanStatus: ScanGate;
  maxRiskScore: number;
  mcpTrust: { minScore: number; onDigestChange: DigestChangeAction };
}

/**
 * Conservative default gate, aligned with buildDefaultCapabilityPolicy. Trust
 * scores in this gate use the normalized 0..100 scale that ValidationCheckResult
 * carries (the governance engine's raw 0..1000 minScore of 500 maps to 50 here).
 */
export function buildDefaultValidationGatePolicy(): ValidationGatePolicy {
  return {
    requiredTrustLevel: 4,
    requiredScanStatus: "requires-review",
    maxRiskScore: 50,
    mcpTrust: { minScore: 50, onDigestChange: "require_review" },
  };
}

export interface ValidationGateResult {
  decision: ValidationDecision;
  findings: ValidationFinding[];
}

/**
 * Evaluate collected evidence against the publish-time gate. Pure; mirrors the
 * trust/scan/mcp gates in evaluateCapabilityPolicy. Callers decide whether to
 * enforce the decision (see QDAI_CAPABILITY_GOVERNANCE_MODE shadow/enforce).
 */
export function evaluateValidationGate(
  policy: ValidationGatePolicy,
  evidence: ValidationEvidence,
  protocol: ValidationProtocol,
): ValidationGateResult {
  const findings: ValidationFinding[] = [];
  let deny = false;
  let review = false;

  if (evidence.trustLevel !== undefined && evidence.trustLevel < policy.requiredTrustLevel) {
    deny = true;
    findings.push({
      code: "trust.below_required",
      message: `Evidence level ${evidence.trustLevel} is below the required level ${policy.requiredTrustLevel}.`,
    });
  }

  if (policy.requiredScanStatus !== "any") {
    const status = evidence.scanStatus ?? "not-run";
    if (status === "failed") {
      deny = true;
      findings.push({
        code: "scan.failed",
        message: "The static security scan failed.",
      });
    } else if (status === "not-run" || status === "unknown") {
      if (policy.requiredScanStatus === "passed") {
        deny = true;
        findings.push({
          code: "scan.not_run",
          message: "A static security scan has not completed.",
        });
      } else {
        review = true;
        findings.push({
          code: "scan.not_run",
          message: "A static security scan has not completed; review required.",
        });
      }
    } else if (status === "requires-review" && policy.requiredScanStatus === "passed") {
      review = true;
      findings.push({
        code: "scan.review_required",
        message: "The static security scan requires review.",
      });
    }
  }

  if (evidence.riskScore !== undefined && evidence.riskScore > policy.maxRiskScore) {
    deny = true;
    findings.push({
      code: "scan.risk_exceeded",
      message: `Scan risk score ${evidence.riskScore} exceeds the policy ceiling ${policy.maxRiskScore}.`,
    });
  }

  if (MCP_PROTOCOLS.has(protocol)) {
    if (evidence.mcpTrustScore !== undefined && evidence.mcpTrustScore < policy.mcpTrust.minScore) {
      deny = true;
      findings.push({
        code: "mcp.trust_below_min",
        message: `MCP trust score ${evidence.mcpTrustScore} is below the minimum ${policy.mcpTrust.minScore}.`,
      });
    }
    if (evidence.digestChanged && policy.mcpTrust.onDigestChange !== "allow") {
      if (policy.mcpTrust.onDigestChange === "block") {
        deny = true;
      } else {
        review = true;
      }
      findings.push({
        code: "mcp.digest_changed",
        message: "The capability definition changed since registration (possible rug-pull).",
      });
    }
  }

  const decision: ValidationDecision = deny ? "deny" : review ? "requires_approval" : "allow";
  return { decision, findings };
}

/** Map a gate decision to the validation status the policy-gate check records. */
export function decisionToValidationStatus(decision: ValidationDecision): ValidationStatus {
  switch (decision) {
    case "allow":
      return "passed";
    case "requires_approval":
      return "requires-review";
    default:
      return "failed";
  }
}
