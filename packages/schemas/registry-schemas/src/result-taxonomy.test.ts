import { describe, expect, it } from "vitest";
import { CAPABILITY_TYPES, CAPABILITY_TYPE_LABELS, getCapabilityCategory } from "./capability";
import {
  buildResultTaxonomyExport,
  deriveResultSetupState,
  getResultKindLabel,
  RESULT_KIND_LABELS,
  RESULT_SETUP_STATES,
} from "./result-taxonomy";

describe("RESULT_KIND_LABELS", () => {
  it("covers every capability type", () => {
    for (const type of CAPABILITY_TYPES) {
      expect(RESULT_KIND_LABELS[type]).toBeDefined();
    }
  });

  it("never reuses a raw protocol acronym as the plain-English label", () => {
    const protocolWords = ["mcp", "a2a", "acp", "ssh", "openui", "chatkit", "a2ui"];
    for (const type of CAPABILITY_TYPES) {
      const { one, other } = RESULT_KIND_LABELS[type];
      for (const word of protocolWords) {
        expect(one.toLowerCase()).not.toContain(word);
        expect(other.toLowerCase()).not.toContain(word);
      }
    }
  });

  it("gives A2A and ACP the same first-glance kind label", () => {
    expect(getResultKindLabel("a2a")).toBe(getResultKindLabel("acp"));
  });

  it("returns the singular form by default and the plural form on request", () => {
    expect(getResultKindLabel("workflow")).toBe("Workflow Template");
    expect(getResultKindLabel("workflow", 2)).toBe("Workflow Templates");
    expect(getResultKindLabel("workflow", 1)).toBe("Workflow Template");
  });
});

describe("deriveResultSetupState", () => {
  it("defaults to available with no reasons when nothing is blocked", () => {
    expect(deriveResultSetupState({})).toEqual({
      state: "available",
      label: "Available to your team",
      reasons: [],
    });
  });

  it("reports needs-connector-setup with the missing steps as reasons", () => {
    const result = deriveResultSetupState({ missingSetup: ["Connect the GitHub account"] });
    expect(result.state).toBe("needs-connector-setup");
    expect(result.reasons).toEqual(["Connect the GitHub account"]);
  });

  it("reports needs-admin-approval with the policy blockers as reasons", () => {
    const result = deriveResultSetupState({ policyBlockers: ["Requires Morgan's approval"] });
    expect(result.state).toBe("needs-admin-approval");
    expect(result.reasons).toEqual(["Requires Morgan's approval"]);
  });

  it("prioritizes unavailable over policy and setup blockers", () => {
    const result = deriveResultSetupState({
      unavailableReasons: ["Not licensed for this workspace"],
      policyBlockers: ["Requires approval"],
      missingSetup: ["Connect an account"],
    });
    expect(result.state).toBe("unavailable");
    expect(result.reasons).toEqual(["Not licensed for this workspace"]);
  });

  it("prioritizes admin approval over connector setup", () => {
    const result = deriveResultSetupState({
      policyBlockers: ["Requires approval"],
      missingSetup: ["Connect an account"],
    });
    expect(result.state).toBe("needs-admin-approval");
  });

  it("never hides a non-available state without a reason", () => {
    for (const state of RESULT_SETUP_STATES) {
      if (state === "available") continue;
      const info =
        state === "unavailable"
          ? deriveResultSetupState({ unavailableReasons: ["x"] })
          : state === "needs-admin-approval"
            ? deriveResultSetupState({ policyBlockers: ["x"] })
            : deriveResultSetupState({ missingSetup: ["x"] });
      expect(info.state).toBe(state);
      expect(info.reasons.length).toBeGreaterThan(0);
    }
  });
});

describe("buildResultTaxonomyExport", () => {
  it("includes one entry per capability type with category, kind, and technical labels", () => {
    const entries = buildResultTaxonomyExport();
    expect(entries).toHaveLength(CAPABILITY_TYPES.length);
    for (const type of CAPABILITY_TYPES) {
      const entry = entries.find((e) => e.type === type);
      expect(entry).toBeDefined();
      expect(entry?.category).toBe(getCapabilityCategory(type));
      expect(entry?.kindLabel).toBe(getResultKindLabel(type, 2));
      expect(entry?.technicalLabel).toBe(CAPABILITY_TYPE_LABELS[type]);
    }
  });

  it("is JSON-serializable", () => {
    expect(() => JSON.stringify(buildResultTaxonomyExport())).not.toThrow();
  });
});
