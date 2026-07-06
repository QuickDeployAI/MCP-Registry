import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { validateRepository } from "../dist/index.js";

test("accepts synchronized exact registry versions", async () => {
  const root = await fixtureRoot({
    packageVersion: "1.2.3",
    serverVersion: "1.2.3",
    registryVersion: "1.2.3",
    manifestPackageVersion: "1.2.3",
  });

  const result = await validateRepository(root);

  assert.deepEqual(result.errors, []);
  assert.equal(result.checkedServers, 1);
});

test("rejects package and registry version drift", async () => {
  const root = await fixtureRoot({
    packageVersion: "1.2.4",
    serverVersion: "1.2.3",
    registryVersion: "1.2.5",
    manifestPackageVersion: "^1.2.3",
  });

  const result = await validateRepository(root);

  assert.ok(result.errors.some((error) => error.includes("package.json version 1.2.4 does not match")));
  assert.ok(result.errors.some((error) => error.includes("must be an exact semver version")));
  assert.ok(result.errors.some((error) => error.includes("registry summary version 1.2.5 does not match")));
});

test("requires OCI package digests and exact version tags", async () => {
  const root = await fixtureRoot({
    packageVersion: "1.2.3",
    serverVersion: "1.2.3",
    registryVersion: "1.2.3",
    manifestPackageVersion: "1.2.3",
    ociIdentifier: "ghcr.io/quickdeployai/example:latest",
    ociDigest: "sha256:not-a-digest",
  });

  const result = await validateRepository(root);

  assert.ok(result.errors.some((error) => error.includes("must record a sha256 digest")));
  assert.ok(result.errors.some((error) => error.includes("must be tagged with version 1.2.3")));
});

async function fixtureRoot(options) {
  const root = await mkdtemp(join(tmpdir(), "registry-cli-"));
  const serverDir = join(root, "servers/example");
  const registryDir = join(root, "registry");

  await mkdir(serverDir, { recursive: true });
  await mkdir(registryDir, { recursive: true });

  const packages = [
    {
      registryType: "npm",
      identifier: "@quickdeployai/mcp-example",
      version: options.manifestPackageVersion,
    },
  ];

  if (options.ociIdentifier) {
    packages.push({
      registryType: "oci",
      identifier: options.ociIdentifier,
      version: options.manifestPackageVersion,
      digest: options.ociDigest,
    });
  }

  await writeJson(join(serverDir, "package.json"), {
    name: "@quickdeployai/mcp-example",
    version: options.packageVersion,
  });
  await writeJson(join(serverDir, "server.json"), {
    name: "ai.quickdeploy/example",
    version: options.serverVersion,
    packages,
  });
  await writeJson(join(registryDir, "index.json"), {
    agents: [
      {
        id: "example",
        server: "servers/example/server.json",
        summary: {
          package: "@quickdeployai/mcp-example",
          version: options.registryVersion,
        },
      },
    ],
  });

  return root;
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
