import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { loadSkillCatalog } from "../src/skill-loader.js";

let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skills-catalog-"));
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function writeSkill(
  relativeDir: string,
  frontmatter: {
    name: string;
    description: string;
    license?: string;
    compatibility?: string;
    metadata?: Record<string, string>;
    allowedTools?: string;
  },
  body = "Use this skill.",
): string {
  const skillDir = path.join(tempRoot, relativeDir);
  fs.mkdirSync(path.join(skillDir, "references", "deep"), { recursive: true });
  fs.mkdirSync(path.join(skillDir, "assets"), { recursive: true });

  const metadata = frontmatter.metadata
    ? `metadata:\n${Object.entries(frontmatter.metadata)
        .map(([key, value]) => `  ${key}: ${value}`)
        .join("\n")}\n`
    : "";
  const allowedTools = frontmatter.allowedTools
    ? `"allowed-tools": ${frontmatter.allowedTools}\n`
    : "";

  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      `name: ${frontmatter.name}`,
      `description: ${frontmatter.description}`,
      frontmatter.license ? `license: ${frontmatter.license}` : "",
      frontmatter.compatibility ? `compatibility: ${frontmatter.compatibility}` : "",
      metadata.trimEnd(),
      allowedTools.trimEnd(),
      "---",
      "",
      body,
      "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  fs.writeFileSync(path.join(skillDir, "references", "deep", "guide.md"), "# Guide\n");
  fs.writeFileSync(path.join(skillDir, "assets", "icon.svg"), "<svg />");
  return skillDir;
}

void test("catalog roots load all valid skills with frontmatter and nested artifacts", () => {
  writeSkill("skills/admin", {
    name: "quickdeploy-admin",
    description: "Operate QuickDeployAI admin workflows",
    license: "MIT",
    compatibility: "codex>=1",
    metadata: { owner: "platform" },
    allowedTools: "Read, Bash",
  });
  writeSkill("skills/deployments", {
    name: "quickdeploy-deployments",
    description: "Handle deployment checks",
  });
  writeSkill("skills/docs", {
    name: "quickdeploy-docs",
    description: "Generate docs",
  });

  const catalog = loadSkillCatalog(path.join(tempRoot, "skills"));

  assert.deepEqual(catalog.diagnostics, []);
  assert.deepEqual(
    catalog.skills.map((skill) => skill.frontmatter.name),
    ["quickdeploy-admin", "quickdeploy-deployments", "quickdeploy-docs"],
  );
  assert.equal(catalog.skills[0]?.frontmatter.license, "MIT");
  assert.equal(catalog.skills[0]?.frontmatter.compatibility, "codex>=1");
  assert.deepEqual(catalog.skills[0]?.frontmatter.metadata, { owner: "platform" });
  assert.equal(catalog.skills[0]?.frontmatter["allowed-tools"], "Read, Bash");
  assert.deepEqual(catalog.skills[0]?.references, ["deep/guide.md"]);
  assert.deepEqual(catalog.skills[0]?.assets, ["icon.svg"]);
});

void test("catalog loading skips malformed skills and reports diagnostics", () => {
  writeSkill("skills/admin", {
    name: "quickdeploy-admin",
    description: "Operate QuickDeployAI admin workflows",
  });
  const malformedDir = path.join(tempRoot, "skills", "broken");
  fs.mkdirSync(malformedDir, { recursive: true });
  fs.writeFileSync(path.join(malformedDir, "SKILL.md"), "missing frontmatter");

  const catalog = loadSkillCatalog(path.join(tempRoot, "skills"));

  assert.deepEqual(
    catalog.skills.map((skill) => skill.frontmatter.name),
    ["quickdeploy-admin"],
  );
  assert.equal(catalog.diagnostics.length, 1);
  assert.equal(catalog.diagnostics[0]?.path, malformedDir);
  assert.match(catalog.diagnostics[0]?.message ?? "", /frontmatter/);
});

void test("registry indexes load referenced skill directories", () => {
  writeSkill("archive/admin", {
    name: "quickdeploy-admin",
    description: "Operate QuickDeployAI admin workflows",
  });
  writeSkill("archive/docs", {
    name: "quickdeploy-docs",
    description: "Generate docs",
  });
  const indexPath = path.join(tempRoot, "registry", "index.json");
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(
    indexPath,
    JSON.stringify(
      {
        agents: [
          { skill: "../archive/docs/SKILL.md", summary: "docs" },
          { skill: "../archive/admin/SKILL.md", summary: "admin" },
        ],
      },
      null,
      2,
    ),
  );

  const catalog = loadSkillCatalog(indexPath);

  assert.deepEqual(catalog.diagnostics, []);
  assert.deepEqual(
    catalog.skills.map((skill) => skill.frontmatter.name),
    ["quickdeploy-admin", "quickdeploy-docs"],
  );
});
