import { describe, expect, it } from "vitest";
import {
  buildCapabilityExperienceEvidenceManifest,
  buildCapabilityExperienceHostRendering,
  buildCapabilityExperiencePack,
  CAPABILITY_EXPERIENCE_HOSTS,
  CAPABILITY_EXPERIENCE_PACK_SCHEMA,
  CapabilityExperiencePackSchema,
  evidenceModeAtLeast,
  GOVERNANCE_FIELDS,
  resolveEvidenceMode,
  type CapabilityExperienceManifestInput,
} from "./capability-experience-pack";

function manifestInput(
  overrides: Partial<CapabilityExperienceManifestInput> = {},
): CapabilityExperienceManifestInput {
  return {
    capabilityName: "Renewal Follow-up Assistant",
    capabilityType: "agent-skill",
    capabilityPromise: "Draft renewal follow-ups from approved account notes.",
    publisher: {
      name: "Acme MSP",
      verified: true,
      supportModel: "Business hours support",
    },
    reviewStatus: { state: "ready", label: "Ready to try" },
    access: {
      scopes: ["crm-read", "draft-write"],
      credentialModel: "Secret reference",
    },
    safeTestResult: "passed",
    claimedEvidenceMode: "live-e2e",
    cost: {
      summary: "Capped at $20/30-day pilot.",
      capUsd: 20,
      period: "30-day pilot",
    },
    monitoring: {
      summary: "Spend and draft volume tracked.",
      link: "https://status.example/cap",
    },
    controlPath: {
      pause: "Pause from the capability card.",
      disable: "Disable removes the client target only.",
      rollback: "Rollback restores the prior manual workflow.",
    },
    ...overrides,
  };
}

describe("resolveEvidenceMode", () => {
  it("keeps a live-e2e claim when the safe test passed", () => {
    expect(resolveEvidenceMode("live-e2e", "passed")).toBe("live-e2e");
  });

  it("never lets a live-e2e claim survive an unpassed safe test", () => {
    expect(resolveEvidenceMode("live-e2e", "not-run")).toBe("mocked-ui");
    expect(resolveEvidenceMode("live-e2e", "requires-review")).toBe("mocked-ui");
  });

  it("leaves weaker claims untouched", () => {
    expect(resolveEvidenceMode("mocked-ui", "not-run")).toBe("mocked-ui");
    expect(resolveEvidenceMode("unverified", "passed")).toBe("unverified");
  });
});

describe("evidenceModeAtLeast", () => {
  it("orders unverified < mocked-ui < live-e2e", () => {
    expect(evidenceModeAtLeast("live-e2e", "mocked-ui")).toBe(true);
    expect(evidenceModeAtLeast("mocked-ui", "live-e2e")).toBe(false);
    expect(evidenceModeAtLeast("unverified", "unverified")).toBe(true);
  });
});

describe("buildCapabilityExperienceEvidenceManifest", () => {
  it("downgrades an inflated live-e2e claim to mocked-ui", () => {
    const manifest = buildCapabilityExperienceEvidenceManifest(
      manifestInput({
        claimedEvidenceMode: "live-e2e",
        safeTestResult: "not-run",
      }),
    );
    expect(manifest.safeTest.evidenceMode).toBe("mocked-ui");
    expect(manifest.safeTest.result).toBe("not-run");
  });

  it("preserves a genuine live-e2e claim backed by a passed safe test", () => {
    const manifest = buildCapabilityExperienceEvidenceManifest(manifestInput());
    expect(manifest.safeTest.evidenceMode).toBe("live-e2e");
  });

  it("parses under the strict evidence manifest schema", () => {
    const manifest = buildCapabilityExperienceEvidenceManifest(manifestInput());
    expect(() =>
      CapabilityExperiencePackSchema.shape.evidenceManifest.parse(manifest),
    ).not.toThrow();
  });
});

describe("buildCapabilityExperienceHostRendering", () => {
  const manifest = buildCapabilityExperienceEvidenceManifest(manifestInput());
  const chatgptHost = CAPABILITY_EXPERIENCE_HOSTS.find((host) => host.id === "chatgpt-apps-sdk")!;
  const genericHost = CAPABILITY_EXPERIENCE_HOSTS.find(
    (host) => host.id === "generic-embedded-host",
  )!;

  it("throws when a host hides fields without a fallback detail link", () => {
    expect(() => buildCapabilityExperienceHostRendering(manifest, chatgptHost)).toThrow(
      /fallbackDetailUrl/,
    );
  });

  it("requires an approval gate whenever governance fields are hidden (Morgan's requirement)", () => {
    const rendering = buildCapabilityExperienceHostRendering(
      manifest,
      chatgptHost,
      "https://marketplace.quickdeploy.ai/capabilities/renewal-follow-up",
    );
    expect(rendering.hiddenFields.length).toBeGreaterThan(0);
    expect(rendering.requiresApprovalGate).toBe(true);
    expect(rendering.fallbackDetailUrl).toBeTruthy();
  });

  it("never hides the control path or safe-test status, even on a constrained host", () => {
    const rendering = buildCapabilityExperienceHostRendering(
      manifest,
      chatgptHost,
      "https://marketplace.quickdeploy.ai/capabilities/renewal-follow-up",
    );
    expect(rendering.visibleFields).toContain("control-path");
    expect(rendering.visibleFields).toContain("safe-test-status");
  });

  it("hides nothing on the generic embedded host and needs no fallback link", () => {
    const rendering = buildCapabilityExperienceHostRendering(manifest, genericHost);
    expect(rendering.hiddenFields).toEqual([]);
    expect(rendering.requiresApprovalGate).toBe(false);
    expect(rendering.visibleFields).toEqual(GOVERNANCE_FIELDS);
  });

  it("surfaces host-specific placement/review differences (Casey's requirement)", () => {
    const rendering = buildCapabilityExperienceHostRendering(
      manifest,
      chatgptHost,
      "https://marketplace.quickdeploy.ai/capabilities/renewal-follow-up",
    );
    expect(rendering.placement).toMatch(/directory review/i);
  });
});

describe("buildCapabilityExperiencePack", () => {
  it("builds a pack with a rendering per known host and passes schema validation", () => {
    const manifest = buildCapabilityExperienceEvidenceManifest(manifestInput());
    const pack = buildCapabilityExperiencePack(manifest, [
      {
        host: CAPABILITY_EXPERIENCE_HOSTS.find((host) => host.id === "chatgpt-apps-sdk")!,
        fallbackDetailUrl: "https://marketplace.quickdeploy.ai/capabilities/renewal-follow-up",
      },
      {
        host: CAPABILITY_EXPERIENCE_HOSTS.find((host) => host.id === "generic-embedded-host")!,
      },
    ]);

    expect(pack.schema).toBe(CAPABILITY_EXPERIENCE_PACK_SCHEMA);
    expect(pack.hostRenderings).toHaveLength(2);
    expect(() => CapabilityExperiencePackSchema.parse(pack)).not.toThrow();
  });

  it("defaults previewOnly to true so a build never implies publication", () => {
    const manifest = buildCapabilityExperienceEvidenceManifest(manifestInput());
    const pack = buildCapabilityExperiencePack(manifest, [
      {
        host: CAPABILITY_EXPERIENCE_HOSTS.find((host) => host.id === "generic-embedded-host")!,
      },
    ]);
    expect(pack.previewOnly).toBe(true);
  });
});
