import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { LoadedSkill } from "../src/skill-loader.js";
import { createLocalSandboxRunner, type ScriptSandboxRequest, registerTools } from "../src/tools.js";

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
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skills-mcp-test-"));
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function createSkill(scriptBody: string): LoadedSkill {
  const skillDir = path.join(tempRoot, "skill");
  const scriptsDir = path.join(skillDir, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(path.join(scriptsDir, "allowed.mjs"), scriptBody);

  return {
    frontmatter: {
      name: "sample-skill",
      description: "Sample skill",
    },
    body: "Use this skill.",
    skillDir,
    scripts: ["allowed.mjs"],
    references: [],
    assets: [],
  };
}

test("scripts are not exposed by default", async () => {
  const skill = createSkill("console.log('should not run');");
  const server = new FakeServer();

  registerTools(server as unknown as Server, skill, {
    sandboxRunner: async () => {
      throw new Error("sandbox runner should not be called");
    },
  });

  const listed = await server.request("tools/list");
  assert.deepEqual(
    (listed as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name),
    ["list-prompts", "call-prompt"],
  );
});

test("allowlisted script runs through the sandbox runner", async () => {
  const skill = createSkill("console.log(['ok', ...process.argv.slice(2)].join(' '));");
  const server = new FakeServer();
  const calls: ScriptSandboxRequest[] = [];

  registerTools(server as unknown as Server, skill, {
    allowedScripts: ["allowed.mjs"],
    sandboxRunner: async (request) => {
      calls.push(request);
      return { stdout: "ok one two\n", stderr: "" };
    },
  });

  const listed = await server.request("tools/list");
  assert.deepEqual(
    (listed as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name),
    ["list-prompts", "call-prompt", "allowed"],
  );

  const called = await server.request("tools/call", {
    params: {
      name: "allowed",
      arguments: {
        args: ["one", "two"],
      },
    },
  });
  assert.deepEqual(called, { content: [{ type: "text", text: "ok one two\n" }] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].skillDir, skill.skillDir);
  assert.equal(calls[0].scriptPath, path.join(skill.skillDir, "scripts", "allowed.mjs"));
  assert.deepEqual(calls[0].args, ["one", "two"]);
});

test("default sandbox runner delegates script execution to MXC with closed policy", async () => {
  const outsideHostPath = path.join(tempRoot, "host-write.txt");
  const skill = createSkill(
    "import { writeFileSync } from 'node:fs'; writeFileSync('../host-write.txt', 'escaped');",
  );
  const server = new FakeServer();
  const mxcRequests: any[] = [];

  registerTools(server as unknown as Server, skill, {
    allowedScripts: ["allowed"],
    sandboxRunner: createLocalSandboxRunner({
      async run(request) {
        mxcRequests.push(request);
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    }),
  });

  const called = await server.request("tools/call", {
    params: {
      name: "allowed",
      arguments: {},
    },
  });

  assert.deepEqual(called, { content: [{ type: "text", text: "" }] });
  assert.equal(fs.existsSync(outsideHostPath), false);
  assert.equal(mxcRequests.length, 1);
  assert.equal(mxcRequests[0].allowOutbound, false);
  assert.equal(mxcRequests[0].cwd.includes(skill.skillDir), false);
  assert.equal(mxcRequests[0].commandLine.includes(skill.skillDir), false);
  assert.ok(mxcRequests[0].readonlyPaths[0].endsWith(path.join("skill")));
  assert.ok(mxcRequests[0].readwritePaths[0].startsWith(os.tmpdir()));
});

test("sandbox runner only passes explicitly allowed env vars", async () => {
  process.env.SKILLS_MCP_TEST_SECRET = "redacted";
  process.env.SKILLS_MCP_TEST_ALLOWED = "visible";
  const skill = createSkill(
    "console.log(`${process.env.SKILLS_MCP_TEST_ALLOWED ?? 'missing'}:${process.env.SKILLS_MCP_TEST_SECRET ?? 'missing'}`);",
  );
  const server = new FakeServer();
  const mxcRequests: any[] = [];

  try {
    registerTools(server as unknown as Server, skill, {
      allowedScripts: ["allowed.mjs"],
      envPassthrough: ["SKILLS_MCP_TEST_ALLOWED"],
      sandboxRunner: createLocalSandboxRunner({
        async run(request) {
          mxcRequests.push(request);
          return { stdout: "visible:missing\n", stderr: "", exitCode: 0 };
        },
      }),
    });

    const called = await server.request("tools/call", {
      params: {
        name: "allowed",
        arguments: {},
      },
    });

    assert.deepEqual(called, { content: [{ type: "text", text: "visible:missing\n" }] });
    assert.equal(mxcRequests[0].env.SKILLS_MCP_TEST_ALLOWED, "visible");
    assert.equal(mxcRequests[0].env.SKILLS_MCP_TEST_SECRET, undefined);
  } finally {
    delete process.env.SKILLS_MCP_TEST_SECRET;
    delete process.env.SKILLS_MCP_TEST_ALLOWED;
  }
});
