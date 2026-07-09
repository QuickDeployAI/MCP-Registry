import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { loadSkillCatalog } from "../src/skill-loader.js";
import {
  parseSkillSourceArg,
  resolveSkillSource,
  type GitCommandRunner,
  type HttpFetcher,
} from "../src/source.js";

let tempRoot = "";
let cacheDir = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "source-adapter-"));
  cacheDir = path.join(tempRoot, "cache");
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function skillMarkdown(name: string, description: string): string {
  return ["---", `name: ${name}`, `description: ${description}`, "---", "", "Body.", ""].join("\n");
}

void test("parseSkillSourceArg detects git, http, file, and bare paths", () => {
  assert.deepEqual(parseSkillSourceArg("git+https://github.com/example/repo.git", "main"), {
    type: "git",
    uri: "git+https://github.com/example/repo.git",
    ref: "main",
  });
  assert.deepEqual(parseSkillSourceArg("git+https://github.com/example/repo.git"), {
    type: "git",
    uri: "git+https://github.com/example/repo.git",
    ref: "HEAD",
  });
  assert.deepEqual(parseSkillSourceArg("https://example.com/registry/index.json"), {
    type: "http",
    uri: "https://example.com/registry/index.json",
  });
  const filePathSpec = parseSkillSourceArg("./some/skills");
  assert.equal(filePathSpec.type, "file");
  assert.ok(filePathSpec.uri.startsWith("file://"));
});

void test("file source resolves the directory as-is", async () => {
  const skillDir = path.join(tempRoot, "skills", "admin");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillMarkdown("quickdeploy-admin", "Admin"));

  const resolved = await resolveSkillSource({
    type: "file",
    uri: `file://${path.join(tempRoot, "skills")}`,
  });

  assert.equal(resolved.refreshed, false);
  const catalog = loadSkillCatalog(resolved.path);
  assert.deepEqual(
    catalog.skills.map((s) => s.frontmatter.name),
    ["quickdeploy-admin"],
  );
});

void test("git source shallow-clones once and reuses the cache when the remote is unchanged", async () => {
  const calls: string[][] = [];
  let lsRemoteCalls = 0;

  const gitRunner: GitCommandRunner = async (args, options) => {
    calls.push([...args]);
    if (args[0] === "ls-remote") {
      lsRemoteCalls += 1;
      return { stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\trefs/heads/main\n" };
    }
    if (args[0] === "rev-parse") {
      return { stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n" };
    }
    if (args[0] === "checkout" && options.cwd) {
      const skillDir = path.join(options.cwd, "cloned-skill");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        skillMarkdown("quickdeploy-cloned", "Cloned skill"),
      );
    }
    return { stdout: "" };
  };

  const spec = {
    type: "git" as const,
    uri: "git+https://github.com/example/agent-skills.git",
    ref: "main",
  };

  const first = await resolveSkillSource(spec, { cacheDir, gitRunner });
  assert.equal(first.refreshed, true);
  assert.equal(first.resolvedRef, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.deepEqual(
    loadSkillCatalog(first.path).skills.map((s) => s.frontmatter.name),
    ["quickdeploy-cloned"],
  );

  const fetchCallsAfterFirst = calls.filter((c) => c[0] === "fetch").length;

  const second = await resolveSkillSource(spec, { cacheDir, gitRunner });
  assert.equal(second.refreshed, false);
  assert.equal(second.path, first.path);
  assert.equal(lsRemoteCalls, 2);
  assert.equal(
    calls.filter((c) => c[0] === "fetch").length,
    fetchCallsAfterFirst,
    "unchanged remote ref must not trigger another fetch",
  );
});

void test("git source refetches when the remote ref moves", async () => {
  let currentSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  let fetchCount = 0;

  const gitRunner: GitCommandRunner = async (args, options) => {
    if (args[0] === "ls-remote") {
      return { stdout: `${currentSha}\trefs/heads/main\n` };
    }
    if (args[0] === "fetch") {
      fetchCount += 1;
    }
    if (args[0] === "rev-parse") {
      return { stdout: `${currentSha}\n` };
    }
    if (args[0] === "checkout" && options.cwd) {
      fs.mkdirSync(options.cwd, { recursive: true });
      fs.writeFileSync(
        path.join(options.cwd, "SKILL.md"),
        skillMarkdown("quickdeploy-cloned", `Revision ${currentSha}`),
      );
    }
    return { stdout: "" };
  };

  const spec = {
    type: "git" as const,
    uri: "git+https://github.com/example/agent-skills.git",
    ref: "main",
  };

  const first = await resolveSkillSource(spec, { cacheDir, gitRunner });
  assert.equal(first.refreshed, true);
  assert.equal(fetchCount, 1);

  currentSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const second = await resolveSkillSource(spec, { cacheDir, gitRunner });
  assert.equal(second.refreshed, true);
  assert.equal(second.resolvedRef, currentSha);
  assert.equal(fetchCount, 2);
});

void test("git source with a pinned commit SHA skips ls-remote entirely", async () => {
  const calls: string[][] = [];
  const sha = "cccccccccccccccccccccccccccccccccccccccc";

  const gitRunner: GitCommandRunner = async (args, options) => {
    calls.push([...args]);
    if (args[0] === "rev-parse") return { stdout: `${sha}\n` };
    if (args[0] === "checkout" && options.cwd) {
      fs.mkdirSync(options.cwd, { recursive: true });
      fs.writeFileSync(path.join(options.cwd, "SKILL.md"), skillMarkdown("pinned-skill", "Pinned"));
    }
    return { stdout: "" };
  };

  const spec = {
    type: "git" as const,
    uri: "git+https://github.com/example/agent-skills.git",
    ref: sha,
  };

  const first = await resolveSkillSource(spec, { cacheDir, gitRunner });
  assert.equal(first.resolvedRef, sha);
  assert.ok(!calls.some((c) => c[0] === "ls-remote"), "immutable SHA refs never call ls-remote");

  const second = await resolveSkillSource(spec, { cacheDir, gitRunner });
  assert.equal(second.refreshed, false);
  assert.equal(
    calls.filter((c) => c[0] === "fetch").length,
    1,
    "cached pinned-SHA checkout must not be re-fetched",
  );
});

function fakeFetcher(
  routes: Map<string, { status: number; etag?: string; body: string }>,
): HttpFetcher {
  return async (url, init) => {
    const route = routes.get(url);
    if (!route) {
      return { status: 404, headers: { get: () => null }, text: async () => "" };
    }
    const ifNoneMatch = init?.headers?.["if-none-match"];
    if (ifNoneMatch && route.etag && ifNoneMatch === route.etag) {
      return {
        status: 304,
        headers: { get: (n: string) => (n === "etag" ? route.etag! : null) },
        text: async () => "",
      };
    }
    return {
      status: route.status,
      headers: { get: (n: string) => (n === "etag" ? (route.etag ?? null) : null) },
      text: async () => route.body,
    };
  };
}

void test("http registry source fetches the index and each skill's SKILL.md", async () => {
  const indexUrl = "https://example.com/registry/index.json";
  const routes = new Map([
    [
      indexUrl,
      {
        status: 200,
        etag: '"v1"',
        body: JSON.stringify({
          agents: [{ skill: "playwright-cli/SKILL.md", summary: "Playwright" }],
        }),
      },
    ],
    [
      "https://example.com/registry/playwright-cli/SKILL.md",
      { status: 200, body: skillMarkdown("playwright-cli", "Run playwright") },
    ],
  ]);

  const resolved = await resolveSkillSource(
    { type: "http", uri: indexUrl },
    { cacheDir, fetcher: fakeFetcher(routes) },
  );

  assert.equal(resolved.refreshed, true);
  assert.equal(resolved.resolvedRef, '"v1"');
  const catalog = loadSkillCatalog(resolved.path);
  assert.deepEqual(
    catalog.skills.map((s) => s.frontmatter.name),
    ["playwright-cli"],
  );
});

void test("http registry source short-circuits on a 304 without re-fetching skills", async () => {
  const indexUrl = "https://example.com/registry/index.json";
  let skillFetches = 0;
  const routes = new Map([
    [
      indexUrl,
      {
        status: 200,
        etag: '"v1"',
        body: JSON.stringify({ agents: [{ skill: "a/SKILL.md" }] }),
      },
    ],
    [
      "https://example.com/registry/a/SKILL.md",
      { status: 200, body: skillMarkdown("skill-a", "A") },
    ],
  ]);
  const fetcher: HttpFetcher = async (url, init) => {
    if (url.endsWith("SKILL.md")) skillFetches += 1;
    return fakeFetcher(routes)(url, init);
  };

  const spec = { type: "http" as const, uri: indexUrl };
  const first = await resolveSkillSource(spec, { cacheDir, fetcher });
  assert.equal(first.refreshed, true);
  assert.equal(skillFetches, 1);

  const second = await resolveSkillSource(spec, { cacheDir, fetcher });
  assert.equal(second.refreshed, false);
  assert.equal(skillFetches, 1, "a 304 on the index must not re-fetch individual skills");
  assert.equal(second.path, first.path);
  const catalog = loadSkillCatalog(second.path);
  assert.deepEqual(
    catalog.skills.map((s) => s.frontmatter.name),
    ["skill-a"],
  );
});
