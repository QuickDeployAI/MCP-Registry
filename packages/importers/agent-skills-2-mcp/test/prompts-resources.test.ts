import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { loadSkills } from "../src/skill-loader.js";
import { registerPrompts } from "../src/prompts.js";
import { registerResources } from "../src/resources.js";
import { registerTools } from "../src/tools.js";

class FakeServer {
  readonly handlers = new Map<string, (request?: unknown) => Promise<unknown>>();

  setRequestHandler(
    schema: { method: string },
    handler: (request?: unknown) => Promise<unknown>,
  ): void {
    this.handlers.set(schema.method, handler);
  }

  async request(method: string, request?: unknown): Promise<unknown> {
    const handler = this.handlers.get(method);
    assert.ok(handler, `handler not registered: ${method}`);
    return handler(request);
  }
}

let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skills-mcp-capabilities-"));
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function writeSkill(
  relativeDir: string,
  frontmatter: { name: string; description: string },
  body: string,
): void {
  const skillDir = path.join(tempRoot, "repo", "skills", relativeDir);
  fs.mkdirSync(path.join(skillDir, "references"), { recursive: true });
  fs.mkdirSync(path.join(skillDir, "assets"), { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${frontmatter.name}\ndescription: ${frontmatter.description}\n---\n\n${body}\n`,
  );
  fs.writeFileSync(path.join(skillDir, "references", "guide.md"), `# ${frontmatter.name}\n`);
  fs.writeFileSync(path.join(skillDir, "assets", "icon.svg"), "<svg />");
}

test("repo roots load every unique skill and expose prompts plus resources", async () => {
  writeSkill(
    "quickdeploy-admin",
    { name: "quickdeploy-admin", description: "Admin ops" },
    "Run admin tasks.",
  );
  writeSkill(
    "design-review",
    { name: "design-review", description: "Review UI" },
    "Review UI changes.",
  );

  const skills = loadSkills(path.join(tempRoot, "repo"));
  const server = new FakeServer();

  registerPrompts(server as unknown as Server, skills);
  registerResources(server as unknown as Server, skills);

  const prompts = await server.request("prompts/list");
  assert.deepEqual(prompts, {
    prompts: [
      { name: "design-review", description: "Review UI" },
      { name: "quickdeploy-admin", description: "Admin ops" },
    ],
  });

  const prompt = await server.request("prompts/get", {
    params: { name: "quickdeploy-admin" },
  });
  assert.equal(
    (prompt as { messages: Array<{ content: { text: string } }> }).messages[0].content.text,
    "Run admin tasks.",
  );
  assert.deepEqual((prompt as { _meta: Record<string, unknown> })._meta.quickdeploy, {
    resources: [
      "skill://quickdeploy-admin/SKILL.md",
      "skill://quickdeploy-admin/references/guide.md",
      "skill://quickdeploy-admin/assets/icon.svg",
    ],
  });

  const resources = await server.request("resources/list");
  const uris = (resources as { resources: Array<{ uri: string }> }).resources.map((r) => r.uri);
  assert.deepEqual(uris, [
    "skill://index.json",
    "skill://design-review/SKILL.md",
    "skill://design-review/references/guide.md",
    "skill://design-review/assets/icon.svg",
    "skill://quickdeploy-admin/SKILL.md",
    "skill://quickdeploy-admin/references/guide.md",
    "skill://quickdeploy-admin/assets/icon.svg",
  ]);

  const read = await server.request("resources/read", {
    params: { uri: "skill://quickdeploy-admin/SKILL.md" },
  });
  assert.match(
    (read as { contents: Array<{ text: string }> }).contents[0].text,
    /name: quickdeploy-admin/,
  );
});

test("tool-only clients can list and call prompt projections", async () => {
  writeSkill(
    "quickdeploy-admin",
    { name: "quickdeploy-admin", description: "Admin ops" },
    "Run admin tasks.",
  );
  const skills = loadSkills(path.join(tempRoot, "repo"));
  const server = new FakeServer();

  registerTools(server as unknown as Server, skills);

  const listed = await server.request("tools/list");
  assert.deepEqual(
    (listed as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name),
    ["list-prompts", "call-prompt"],
  );

  const catalog = await server.request("tools/call", {
    params: { name: "list-prompts", arguments: {} },
  });
  assert.match(
    (catalog as { content: Array<{ text: string }> }).content[0].text,
    /quickdeploy-admin/,
  );

  const called = await server.request("tools/call", {
    params: { name: "call-prompt", arguments: { name: "quickdeploy-admin" } },
  });
  assert.deepEqual(called, {
    content: [{ type: "text", text: "Run admin tasks." }],
    _meta: {
      quickdeploy: {
        resources: [
          "skill://quickdeploy-admin/SKILL.md",
          "skill://quickdeploy-admin/references/guide.md",
          "skill://quickdeploy-admin/assets/icon.svg",
        ],
      },
    },
  });
});
