import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyCredentialAuth,
  authEnvironmentVariables,
  defineConfig,
  envCredential,
  fetchTextSource,
  manifestEnvCredential,
  ok,
  parseVersion,
  redactCredentialValues,
  resolveCredential,
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

test("credential sources resolve from env and manifest valueFrom.env", () => {
  assert.equal(resolveCredential(envCredential("API_TOKEN"), { API_TOKEN: "secret" }), "secret");
  assert.equal(
    resolveCredential(manifestEnvCredential("MANIFEST_TOKEN"), { MANIFEST_TOKEN: "manifest-secret" }),
    "manifest-secret",
  );
  assert.throws(
    () => resolveCredential(envCredential("MISSING"), {}),
    /Missing required credential environment variable MISSING/,
  );
});

test("applyCredentialAuth injects bearer, api keys, basic, oauth2, and grpc metadata", () => {
  const bearer = applyCredentialAuth(
    [{ type: "bearer", token: envCredential("BEARER_TOKEN") }],
    { BEARER_TOKEN: "bearer-secret" },
  );
  const apiKeys = applyCredentialAuth([
    { type: "apiKey", in: "header", name: "x-api-key", value: envCredential("API_KEY") },
    { type: "apiKey", in: "query", name: "api_key", value: envCredential("QUERY_KEY") },
  ], {
    API_KEY: "header-secret",
    QUERY_KEY: "query-secret",
  });
  const basic = applyCredentialAuth(
    [{ type: "basic", username: envCredential("BASIC_USER"), password: envCredential("BASIC_PASS") }],
    { BASIC_USER: "alice", BASIC_PASS: "wonderland" },
  );
  const oauth2 = applyCredentialAuth(
    [{ type: "oauth2ClientCredentials", accessToken: envCredential("OAUTH_TOKEN"), headerName: "X-OAuth" }],
    { OAUTH_TOKEN: "oauth-secret" },
  );

  assert.equal(bearer.headers.Authorization, "Bearer bearer-secret");
  assert.equal(bearer.metadata.authorization, "Bearer bearer-secret");
  assert.deepEqual(apiKeys.query, { api_key: "query-secret" });
  assert.equal(apiKeys.headers["x-api-key"], "header-secret");
  assert.equal(apiKeys.metadata["x-api-key"], "header-secret");
  assert.equal(basic.headers.Authorization, "Basic YWxpY2U6d29uZGVybGFuZA==");
  assert.equal(oauth2.headers["X-OAuth"], "Bearer oauth-secret");
});

test("authEnvironmentVariables and redaction keep secrets off logs", () => {
  const configs = [
    { type: "bearer", token: envCredential("SERVICE_TOKEN") },
    { type: "apiKey", in: "query", name: "api_key", value: manifestEnvCredential("SERVICE_TOKEN") },
  ];

  assert.deepEqual(authEnvironmentVariables(configs), [{
    name: "SERVICE_TOKEN",
    isSecret: true,
    description: "Bearer token for Authorization",
  }]);
  assert.equal(
    redactCredentialValues("failed with secret-value", configs, { SERVICE_TOKEN: "secret-value" }),
    "failed with [REDACTED]",
  );
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
