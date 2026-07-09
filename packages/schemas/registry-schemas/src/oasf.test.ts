import { describe, expect, it } from "vitest";
import {
  AGNTCY_DIR_SOURCE,
  capabilityToOasf,
  oasfToCapability,
  OasfRecordSchema,
  resolveAgntcyTransport,
  resolveOasfCapabilityType,
  type CapabilityExportInput,
} from "./oasf";

describe("oasfToCapability", () => {
  it("maps an A2A-locator record to the a2a type with http transport", () => {
    const { type, transport, inference } = oasfToCapability({
      name: "support-agent",
      version: "1.4.0",
      description: "Triages support tickets",
      authors: ["Acme Corp"],
      skills: [{ name: "triage" }, { name: "escalate" }],
      locators: [{ type: "a2a-agent-card", url: "https://agents.acme.test/.well-known/agent.json" }],
    });

    expect(type).toBe("a2a");
    expect(transport).toBe("http");
    expect(inference.name).toBe("support-agent");
    expect(inference.publisher).toBe("Acme Corp");
    expect(inference.inferred.source).toBe(AGNTCY_DIR_SOURCE);
    expect(inference.inferred.serviceEndpoint).toBe(
      "https://agents.acme.test/.well-known/agent.json",
    );
    expect(inference.inferred.skills).toEqual(["triage", "escalate"]);
    expect(inference.missingRequired).toEqual([]);
  });

  it("maps an MCP-exposing record to the mcp type", () => {
    const { type } = oasfToCapability({
      name: "files-mcp",
      locators: [{ type: "mcp-server", url: "https://mcp.acme.test" }],
      extensions: [{ name: "schema.oasf.agntcy.org/features/runtime/mcp" }],
    });
    expect(type).toBe("mcp");
  });

  it("detects SLIM and Connect-Protocol transports from locators/extensions", () => {
    expect(
      resolveAgntcyTransport(
        OasfRecordSchema.parse({ name: "a", locators: [{ type: "slim" }] }),
      ),
    ).toBe("slim");
    expect(
      resolveAgntcyTransport(
        OasfRecordSchema.parse({ name: "a", extensions: [{ name: "agntcy.connect" }] }),
      ),
    ).toBe("acp");
    expect(resolveAgntcyTransport(OasfRecordSchema.parse({ name: "a" }))).toBe("http");
  });

  it("defaults a bare agent record to a2a", () => {
    expect(resolveOasfCapabilityType(OasfRecordSchema.parse({ name: "bare" }))).toBe("a2a");
  });

  it("rejects a record without a name", () => {
    expect(() => oasfToCapability({ description: "no name" })).toThrow();
  });
});

describe("capabilityToOasf", () => {
  const base: CapabilityExportInput = {
    type: "a2a",
    name: "support-agent",
    version: "1.4.0",
    description: "Triages support tickets",
    publisher: "Acme Corp",
    license: "Apache-2.0",
    serviceEndpoint: "https://agents.acme.test/.well-known/agent.json",
    skills: [{ name: "triage" }],
  };

  it("emits an a2a-agent-card locator and derives authors from publisher", () => {
    const record = capabilityToOasf(base);
    expect(record.name).toBe("support-agent");
    expect(record.authors).toEqual(["Acme Corp"]);
    expect(record.locators?.[0]).toMatchObject({
      type: "a2a-agent-card",
      url: "https://agents.acme.test/.well-known/agent.json",
    });
    expect(record.annotations?.license).toBe("Apache-2.0");
  });

  it("uses an mcp-server locator for mcp capabilities", () => {
    const record = capabilityToOasf({ ...base, type: "mcp" });
    expect(record.locators?.[0]?.type).toBe("mcp-server");
  });

  it("never announces secret-looking annotation keys", () => {
    const record = capabilityToOasf({
      ...base,
      annotations: {
        "deploy.region": "us-east-1",
        "api-key": "sk-leaked",
        OPENAI_TOKEN: "leaked",
        password: "leaked",
      },
    });
    expect(record.annotations).toMatchObject({ "deploy.region": "us-east-1", license: "Apache-2.0" });
    expect(record.annotations).not.toHaveProperty("api-key");
    expect(record.annotations).not.toHaveProperty("OPENAI_TOKEN");
    expect(record.annotations).not.toHaveProperty("password");
  });
});

describe("OASF round-trip", () => {
  it("preserves type, identity, endpoint and transport for a2a and mcp", () => {
    for (const type of ["a2a", "mcp"] as const) {
      const input: CapabilityExportInput = {
        type,
        name: "round-trip-agent",
        version: "2.0.1",
        description: "Round trips cleanly",
        publisher: "Acme Corp",
        serviceEndpoint: "https://agents.acme.test/endpoint",
      };
      const record = capabilityToOasf(input);
      const imported = oasfToCapability(record);

      expect(imported.type).toBe(type);
      expect(imported.transport).toBe("http");
      expect(imported.inference.name).toBe(input.name);
      expect(imported.inference.version).toBe(input.version);
      expect(imported.inference.description).toBe(input.description);
      expect(imported.inference.publisher).toBe("Acme Corp");
      expect(imported.inference.inferred.serviceEndpoint).toBe(input.serviceEndpoint);
    }
  });
});
