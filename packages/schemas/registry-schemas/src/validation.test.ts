import { describe, expect, it } from "vitest";
import {
  aggregateRunStatus,
  badgeLabel,
  buildDefaultValidationGatePolicy,
  categoryToEvidenceLevel,
  decisionToValidationStatus,
  deriveBadge,
  deriveBadges,
  detectDigestChange,
  evaluateValidationGate,
  riskScoreToBand,
  riskScoreToGrade,
  riskScoreToScanStatus,
  resultsToStaticScanResult,
  resultsToValidationEvidence,
  type ValidationCheckResult,
  type ValidationRun,
} from "./validation";

function result(
  partial: Partial<ValidationCheckResult> & Pick<ValidationCheckResult, "category">,
): ValidationCheckResult {
  return {
    checkId: "test",
    status: "passed",
    summary: "",
    findings: [],
    ...partial,
  };
}

function run(results: ValidationCheckResult[], extra: Partial<ValidationRun> = {}): ValidationRun {
  return {
    runId: "run_1",
    capabilityKey: "cap_1",
    version: "1.0.0",
    protocol: "mcp",
    source: "user-publish",
    status: aggregateRunStatus(results),
    results,
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    ...extra,
  };
}

describe("risk banding", () => {
  it("bands and grades by score", () => {
    expect(riskScoreToBand(10)).toBe("low");
    expect(riskScoreToBand(40)).toBe("medium");
    expect(riskScoreToBand(70)).toBe("high");
    expect(riskScoreToBand(95)).toBe("critical");
    expect(riskScoreToGrade(10)).toBe("A");
    expect(riskScoreToGrade(95)).toBe("F");
  });

  it("derives scan status: low passes, medium reviews, high/critical fail", () => {
    expect(riskScoreToScanStatus(5)).toBe("passed");
    expect(riskScoreToScanStatus(35)).toBe("requires-review");
    expect(riskScoreToScanStatus(60)).toBe("failed");
    expect(riskScoreToScanStatus(90)).toBe("failed");
  });

  it("clamps out-of-range scores", () => {
    expect(riskScoreToBand(-5)).toBe("low");
    expect(riskScoreToBand(150)).toBe("critical");
  });
});

describe("detectDigestChange", () => {
  it("flags a changed digest only when both are present and differ", () => {
    expect(detectDigestChange("a", "b")).toBe(true);
    expect(detectDigestChange("a", "a")).toBe(false);
    expect(detectDigestChange(undefined, "b")).toBe(false);
    expect(detectDigestChange("a", undefined)).toBe(false);
  });
});

describe("categoryToEvidenceLevel", () => {
  it("maps only security/evals/policy-gate to ladder rungs", () => {
    expect(categoryToEvidenceLevel("security")).toBe(4);
    expect(categoryToEvidenceLevel("evals")).toBe(5);
    expect(categoryToEvidenceLevel("policy-gate")).toBe(6);
    expect(categoryToEvidenceLevel("quality")).toBeUndefined();
    expect(categoryToEvidenceLevel("trust")).toBeUndefined();
    expect(categoryToEvidenceLevel("content-safety")).toBeUndefined();
  });
});

describe("aggregateRunStatus", () => {
  it("picks the most severe non-ignored status", () => {
    expect(
      aggregateRunStatus([
        result({ category: "quality", status: "passed" }),
        result({ category: "security", status: "requires-review" }),
        result({ category: "trust", status: "passed" }),
      ]),
    ).toBe("requires-review");
    expect(
      aggregateRunStatus([
        result({ category: "quality", status: "passed" }),
        result({ category: "security", status: "failed" }),
        result({ category: "trust", status: "requires-review" }),
      ]),
    ).toBe("failed");
  });

  it("ignores not-run/skipped and returns not-run when all ignored", () => {
    expect(
      aggregateRunStatus([
        result({ category: "evals", status: "skipped" }),
        result({ category: "content-safety", status: "not-run" }),
      ]),
    ).toBe("not-run");
    expect(aggregateRunStatus([])).toBe("not-run");
  });

  it("returns running while checks are in flight", () => {
    expect(
      aggregateRunStatus([
        result({ category: "security", status: "running" }),
        result({ category: "quality", status: "passed" }),
      ]),
    ).toBe("running");
  });
});

describe("resultsToValidationEvidence", () => {
  it("maps security/trust results and the highest passed rung to trustLevel", () => {
    const evidence = resultsToValidationEvidence([
      result({ category: "security", status: "passed", score: 12 }),
      result({ category: "evals", status: "passed" }),
      result({
        category: "trust",
        status: "requires-review",
        score: 600,
        findings: [{ code: "trust.digest_changed", message: "changed" }],
      }),
    ]);
    expect(evidence.scanStatus).toBe("passed");
    expect(evidence.riskScore).toBe(12);
    expect(evidence.mcpTrustScore).toBe(600);
    expect(evidence.digestChanged).toBe(true);
    // security (4) passed and evals (5) passed -> highest rung 5
    expect(evidence.trustLevel).toBe(5);
  });

  it("omits trustLevel when no rung-bearing check passed", () => {
    const evidence = resultsToValidationEvidence([
      result({ category: "quality", status: "passed" }),
      result({ category: "security", status: "failed", score: 90 }),
    ]);
    expect(evidence.trustLevel).toBeUndefined();
    expect(evidence.scanStatus).toBe("failed");
  });
});

describe("resultsToStaticScanResult", () => {
  it("extracts the security check into the scan-signal shape", () => {
    const scan = resultsToStaticScanResult([
      result({
        category: "security",
        status: "requires-review",
        score: 35,
        summary: "review",
        checkId: "skillspector",
      }),
    ]);
    expect(scan).not.toBeNull();
    expect(scan?.riskScore).toBe(35);
    expect(scan?.status).toBe("requires-review");
    expect(scan?.scannerId).toBe("skillspector");
  });

  it("returns null when no security check ran", () => {
    expect(
      resultsToStaticScanResult([result({ category: "security", status: "not-run" })]),
    ).toBeNull();
    expect(resultsToStaticScanResult([result({ category: "quality" })])).toBeNull();
  });
});

describe("deriveBadge / deriveBadges", () => {
  it("preserves kind-scoped validation coverage on badges", () => {
    const badges = deriveBadges(
      run(
        [
          result({
            category: "security",
            status: "passed",
            capabilityKinds: ["tool"],
          }),
        ],
        { capabilityKinds: ["tool"] },
      ),
    );
    expect(badges[0].capabilityKinds).toEqual(["tool"]);
    expect(badges.find((badge) => badge.category === "security")?.capabilityKinds).toEqual([
      "tool",
    ]);
  });

  it("maps status to variant + tone", () => {
    expect(deriveBadge(result({ category: "security", status: "passed" })).variant).toBe("success");
    expect(deriveBadge(result({ category: "security", status: "failed" })).variant).toBe(
      "destructive",
    );
    expect(deriveBadge(result({ category: "security", status: "requires-review" })).tone).toBe(
      "review",
    );
    expect(deriveBadge(result({ category: "security", status: "running" })).tone).toBe("pending");
  });

  it("prepends an overall badge and orders checks by category", () => {
    const badges = deriveBadges(
      run(
        [
          result({ category: "trust", status: "passed" }),
          result({ category: "security", status: "passed" }),
          result({ category: "quality", status: "passed" }),
        ],
        { decision: "allow" },
      ),
    );
    expect(badges[0].id).toBe("overall");
    expect(badges[0].label).toBe("Validated");
    // category order: quality, security, ..., trust
    expect(badges.slice(1).map((b) => b.category)).toEqual(["quality", "security", "trust"]);
  });

  it("labels in-flight runs as validating", () => {
    expect(badgeLabel("security", "running")).toBe("Security: validating…");
    expect(deriveBadges(run([result({ category: "security", status: "running" })]))[0].label).toBe(
      "Validating…",
    );
  });
});

describe("evaluateValidationGate", () => {
  const policy = buildDefaultValidationGatePolicy();

  it("allows when evidence clears the gate", () => {
    const res = evaluateValidationGate(
      policy,
      { trustLevel: 5, scanStatus: "passed", riskScore: 10 },
      "mcp",
    );
    expect(res.decision).toBe("allow");
    expect(res.findings).toHaveLength(0);
  });

  it("denies when risk exceeds the ceiling or scan failed", () => {
    expect(evaluateValidationGate(policy, { scanStatus: "failed" }, "mcp").decision).toBe("deny");
    expect(
      evaluateValidationGate(policy, { scanStatus: "passed", riskScore: 80 }, "mcp").decision,
    ).toBe("deny");
  });

  it("requires review when the scan has not run under a review gate", () => {
    const res = evaluateValidationGate(policy, { scanStatus: "not-run" }, "agent-skill");
    expect(res.decision).toBe("requires_approval");
  });

  it("applies mcp-trust gates only to mcp protocols", () => {
    const denyMcp = evaluateValidationGate(
      { ...policy, requiredScanStatus: "any" },
      { mcpTrustScore: 10 }, // below the normalized minScore of 50
      "mcp",
    );
    expect(denyMcp.decision).toBe("deny");
    const allowNonMcp = evaluateValidationGate(
      { ...policy, requiredScanStatus: "any" },
      { mcpTrustScore: 10 },
      "a2a",
    );
    expect(allowNonMcp.decision).toBe("allow");
  });

  it("routes digest change per onDigestChange action", () => {
    expect(
      evaluateValidationGate(
        {
          ...policy,
          requiredScanStatus: "any",
          mcpTrust: { minScore: 0, onDigestChange: "block" },
        },
        { digestChanged: true },
        "mcp",
      ).decision,
    ).toBe("deny");
    expect(
      evaluateValidationGate(
        {
          ...policy,
          requiredScanStatus: "any",
          mcpTrust: { minScore: 0, onDigestChange: "require_review" },
        },
        { digestChanged: true },
        "mcp",
      ).decision,
    ).toBe("requires_approval");
  });

  it("maps decisions to validation statuses", () => {
    expect(decisionToValidationStatus("allow")).toBe("passed");
    expect(decisionToValidationStatus("requires_approval")).toBe("requires-review");
    expect(decisionToValidationStatus("deny")).toBe("failed");
  });
});
