import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  defineConfig,
  fetchTextSource,
  ok,
  parseVersion,
  startServer,
  toolError,
} from "../dist/index.js";

test("defineConfig merges cli, env, and defaults", () => {
  const config = defineConfig({
    feedUrl: { type: "string", cli: "feed", env: ["FEED"], default: null },
    maxItems: { type: "number", env: ["MAX_ITEMS"], default: 500 },
    pollingEnabled: { type: "boolean", cli: "poll", default: true },
  });

  assert.deepEqual(
    config.parse(["--feed", "https://example.test/rss", "--no-poll"], { MAX_ITEMS: "25" }),
    {
      feedUrl: "https://example.test/rss",
      maxItems: 25,
      pollingEnabled: false,
    },
  );
});

test("fetchTextSource reads relative filesystem paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "importer-core-"));
  await writeFile(join(dir, "source.txt"), "hello", "utf8");
  assert.equal(await fetchTextSource("source.txt", { cwd: dir }), "hello");
});

test("result helpers create text envelopes", () => {
  assert.deepEqual(ok({ ready: true }), {
    content: [{ type: "text", text: "{\n  \"ready\": true\n}" }],
  });
  assert.deepEqual(toolError("Missing input", { field: "feedUrl" }), {
    content: [{ type: "text", text: "{\n  \"error\": \"Missing input\",\n  \"field\": \"feedUrl\"\n}" }],
  });
});

test("parseVersion normalizes loose version strings", () => {
  assert.equal(parseVersion("v2.5-beta.1"), "2.5.1");
  assert.equal(parseVersion("3"), "3.0.0");
});

test("startServer connects a transport", async () => {
  const transport = {};
  let connected = false;
  await startServer({
    async connect(actual) {
      connected = actual === transport;
    },
  }, transport);
  assert.equal(connected, true);
});
