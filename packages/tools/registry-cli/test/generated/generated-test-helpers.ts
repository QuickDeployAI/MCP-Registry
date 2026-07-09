import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY,
  McpManifestSchema,
  validateMcpManifestImporterConfig,
  type McpManifest,
} from "@quickdeployai/registry-schemas";
import { buildRegistryArtifacts, compileManifestToServerJson } from "../../src/registry-build";

export function describeGeneratedMcpManifest(options: {
  readonly family: string;
  readonly provider: string;
  readonly manifestPath: string;
  readonly manifest: unknown;
  readonly expected: {
    readonly tools: readonly unknown[];
    readonly resources: readonly unknown[];
    readonly prompts: readonly unknown[];
    readonly authEnvVars: readonly string[];
    readonly serverEnvVars: readonly string[];
  };
}): void {
  describe(`generated MCP manifest: ${options.family}/${options.provider}`, () => {
    it("is schema-valid and exposes the expected surface", () => {
      const manifest = validateMcpManifestImporterConfig(
        McpManifestSchema.parse(options.manifest),
      );

      expect(manifest.spec.expose.tools).toEqual(options.expected.tools);
      expect(manifest.spec.expose.resources).toEqual(options.expected.resources);
      expect(manifest.spec.expose.prompts).toEqual(options.expected.prompts);
      expect(authEnvironmentVariables(manifest)).toEqual(options.expected.authEnvVars);
    });

    it("compiles to the expected server.json entry", () => {
      const manifest = McpManifestSchema.parse(options.manifest);
      const server = compileManifestToServerJson(manifest, options.manifestPath);
      const expectedAuthEnvVars = options.expected.authEnvVars;
      const expectedServerEnvVars = options.expected.serverEnvVars;

      expect(server.name).toBe(manifest.metadata.name);
      expect(server.packages?.[0]).toMatchObject({
        registryType: "oci",
        identifier: "ghcr.io/quickdeployai/mcp-host",
        runtimeHint: "mcp-host",
      });
      expect(server.packages?.[0]?.runtimeArguments).toEqual([
        "run",
        options.manifestPath,
        "--transport",
        manifest.deployment.transport,
      ]);
      expect(server.packages?.[0]?.environmentVariables ?? []).toEqual(expectedServerEnvVars);
      expect((server.environmentVariables ?? []).map((variable) => variable.name)).toEqual(
        expectedServerEnvVars,
      );
      expect(server.packages?.[0]?.environmentVariables ?? []).toEqual(
        expect.arrayContaining([...expectedAuthEnvVars]),
      );
      expect(server._meta?.[QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY]).toEqual(manifest);
    });

    it("produces deterministic registry artifacts from the manifest", async () => {
      const rootDir = await mkdtemp(
        join(tmpdir(), `generated-mcp-${options.family}-${options.provider}-`),
      );
      const target = join(rootDir, options.manifestPath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, `${JSON.stringify(options.manifest, null, 2)}\n`, "utf8");

      const first = await buildRegistryArtifacts({ rootDir });
      const second = await buildRegistryArtifacts({ rootDir });

      expect(first.files["servers.json"]).toBe(second.files["servers.json"]);
      expect(first.generatedFiles["registry/index.json"]).toBe(
        second.generatedFiles["registry/index.json"],
      );
      expect(first.serversJson.servers).toHaveLength(1);
      expect(first.indexJson.providers).toEqual([
        {
          id: options.provider,
          entries: [
            {
              kind: "mcp-manifest",
              name: McpManifestSchema.parse(options.manifest).metadata.name,
              path: options.manifestPath,
              version: McpManifestSchema.parse(options.manifest).metadata.version,
            },
          ],
        },
      ]);
    });
  });
}

function authEnvironmentVariables(manifest: McpManifest): string[] {
  const variables = new Set<string>();
  for (const auth of manifest.spec.auth) {
    switch (auth.type) {
      case "bearer":
        variables.add(auth.valueFrom.env);
        break;
      case "api-key":
        variables.add(auth.valueFrom.env);
        break;
      case "basic":
        variables.add(auth.usernameFrom.env);
        variables.add(auth.passwordFrom.env);
        break;
      case "oauth2":
        if (auth.valueFrom) variables.add(auth.valueFrom.env);
        if (auth.clientIdFrom) variables.add(auth.clientIdFrom.env);
        if (auth.clientSecretFrom) variables.add(auth.clientSecretFrom.env);
        break;
    }
  }
  const deploymentAuth = manifest.deployment.auth;
  if (
    (deploymentAuth?.type === "bearer" || deploymentAuth?.type === "oauth2-resource") &&
    deploymentAuth.tokenFrom
  ) {
    variables.add(deploymentAuth.tokenFrom.env);
  }
  return [...variables].sort((left, right) => left.localeCompare(right));
}
