import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseAllDocuments } from "yaml";

describe("mcp-host deploy artifacts", () => {
  it("packages the host as a production OCI image", async () => {
    const dockerfile = await readFile("Dockerfile", "utf8");

    expect(dockerfile).toContain("pnpm --filter @quickdeployai/mcp-host deploy --prod");
    expect(dockerfile).toContain('ENTRYPOINT ["node", "--import", "tsx", "src/cli.mts"]');
    expect(dockerfile).toContain(
      'CMD ["run", "/manifests/manifest.mcp.yaml", "--transport", "streamable-http"',
    );
    expect(dockerfile).toContain("ghcr.io/quickdeployai/mcp-host@sha256:<digest>");
  });

  it("documents a digest-pinned streamable HTTP Kubernetes deployment", async () => {
    const recipe = await readFile("deploy/k8s/petstore-host.yaml", "utf8");
    const documents = parseAllDocuments(recipe).map((document) => document.toJSON()) as Array<{
      kind?: string;
      metadata?: { name?: string };
      spec?: Record<string, unknown>;
    }>;
    const deployment = documents.find(
      (document) =>
        document.kind === "Deployment" && document.metadata?.name === "petstore-mcp-host",
    );
    expect(deployment).toBeDefined();

    const template = deployment?.spec?.template as {
      spec?: {
        containers?: Array<Record<string, unknown>>;
        volumes?: Array<Record<string, unknown>>;
      };
    };
    const container = template.spec?.containers?.[0] as {
      image?: string;
      args?: string[];
      envFrom?: unknown[];
      readinessProbe?: unknown;
      livenessProbe?: unknown;
      volumeMounts?: unknown[];
    };

    expect(container.image).toMatch(/^ghcr\.io\/quickdeployai\/mcp-host@sha256:[a-f0-9]{64}$/);
    expect(container.args).toEqual([
      "run",
      "/manifests/manifest.mcp.yaml",
      "--transport",
      "streamable-http",
      "--hostname",
      "0.0.0.0",
      "--port",
      "3000",
    ]);
    expect(container.envFrom).toEqual([{ secretRef: { name: "petstore-mcp-secrets" } }]);
    expect(container.readinessProbe).toMatchObject({ httpGet: { path: "/readyz" } });
    expect(container.livenessProbe).toMatchObject({ httpGet: { path: "/healthz" } });
    expect(container.volumeMounts).toEqual([
      { name: "manifest", mountPath: "/manifests", readOnly: true },
    ]);
    expect(template.spec?.volumes).toEqual([
      { name: "manifest", configMap: { name: "petstore-mcp-manifest" } },
    ]);
  });
});
