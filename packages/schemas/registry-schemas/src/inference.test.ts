import { describe, expect, it } from "vitest";
import { inferListingFromManifest, parseSkillFrontmatter } from "./inference";

describe("inferListingFromManifest", () => {
  it("infers mcp fields and flags missing runtime", () => {
    const result = inferListingFromManifest("mcp", {
      name: "io.github.acme/support",
      description: "Triage support tickets",
      version: "1.2.0",
      packages: [{ registryType: "npm", identifier: "@acme/support" }],
      tools: [{ name: "triage" }],
    });
    expect(result.name).toBe("io.github.acme/support");
    expect(result.version).toBe("1.2.0");
    expect(result.missingRequired).toHaveLength(0);
    expect((result.inferred.packages as unknown[]).length).toBe(1);
  });

  it("flags mcp without packages or remotes as missing runtime", () => {
    const result = inferListingFromManifest("mcp", { name: "x" });
    expect(result.missingRequired).toContain("runtime");
  });

  it("parses agent-skill SKILL.md frontmatter", () => {
    const md = `---\nname: pdf-extract\ndescription: Extract tables from PDFs\nlicense: MIT\n---\n\n# Body\nDo the thing.`;
    const result = inferListingFromManifest("agent-skill", md);
    expect(result.name).toBe("pdf-extract");
    expect(result.description).toBe("Extract tables from PDFs");
    expect(result.inferred.license).toBe("MIT");
    expect(result.inferred.hasBody).toBe(true);
    expect(result.missingRequired).toHaveLength(0);
  });

  it("infers a2a agent card and requires a service endpoint", () => {
    const ok = inferListingFromManifest("a2a", {
      name: "Research Agent",
      url: "https://agents.example.com/a2a/research",
      capabilities: { streaming: true },
      skills: [{ name: "search" }],
      provider: { organization: "Example Inc" },
    });
    expect(ok.name).toBe("Research Agent");
    expect(ok.inferred.serviceEndpoint).toBe("https://agents.example.com/a2a/research");
    expect(ok.publisher).toBe("Example Inc");
    expect(ok.missingRequired).toHaveLength(0);

    const missing = inferListingFromManifest("a2a", { name: "No Endpoint" });
    expect(missing.missingRequired).toContain("serviceEndpoint");
  });

  it("infers workflow steps and flags empty steps", () => {
    const result = inferListingFromManifest("workflow", { name: "Nightly", steps: [] });
    expect(result.missingRequired).toContain("steps");
  });

  it("infers pack capabilities", () => {
    const result = inferListingFromManifest("pack", {
      title: "Support Pack",
      capabilities: [{ id: "a", type: "mcp" }],
    });
    expect(result.name).toBe("Support Pack");
    expect(result.missingRequired).toHaveLength(0);
  });

  it("parseSkillFrontmatter returns body when no frontmatter present", () => {
    const { frontmatter, body } = parseSkillFrontmatter("# Just a heading");
    expect(Object.keys(frontmatter)).toHaveLength(0);
    expect(body).toContain("Just a heading");
  });

  it("parseSkillFrontmatter preserves simple YAML list values", () => {
    const { frontmatter } = parseSkillFrontmatter(
      "---\ntitle: Orders\ntags:\n  - ecommerce\n  - sales\n---\nBody",
    );

    expect(frontmatter).toEqual({
      title: "Orders",
      tags: ["ecommerce", "sales"],
    });
  });
});
