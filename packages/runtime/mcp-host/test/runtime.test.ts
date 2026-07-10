import { readFile } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  McpManifestSchema,
  validateMcpManifestImporterConfig,
} from "@quickdeployai/registry-schemas";
import { describe, expect, it } from "vitest";
import { fixturePackageRoot, type SandboxRunner, type PythonFunctionTool } from "@quickdeployai/git-2-mcp";
import { loadManifestFile } from "../src/manifest-loader";
import { createMcpHost, MCP_PROTOCOL_VERSION, startHttpHost } from "../src/runtime";
import { readStdioFrames, runStdioHost, writeStdioFrame } from "../src/stdio";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

describe("mcp-host runtime", () => {
  it("hosts Arazzo workflow tools and honors the workflow allowlist", async () => {
    const source = new URL("./fixtures/ticket-workflows.arazzo.json", import.meta.url).href;
    const manifest = McpManifestSchema.parse({
      apiVersion: "quickdeploy.ai/v1",
      kind: "McpManifest",
      metadata: {
        name: "ai.quickdeploy/ticket-workflows",
        version: "1.0.0",
      },
      spec: {
        importer: {
          engine: "arazzo-2-mcp",
          versionRange: "^0.1.0",
        },
        source: { type: "file", uri: source },
        select: { workflows: ["close-ticket"] },
      },
      deployment: { transport: "stdio" },
    });

    const tools = await createMcpHost({ manifest }).handleJsonRpc({
      jsonrpc: "2.0",
      id: "tools",
      method: "tools/list",
    });

    expect(tools).toMatchObject({
      result: {
        tools: [
          {
            name: "close-ticket",
            inputSchema: {
              type: "object",
              properties: { ticketId: { type: "string" } },
              required: ["ticketId"],
            },
          },
        ],
      },
    });
  });

  it("serves a manifest over streamable HTTP", async () => {
    const manifest = await loadManifestFile("examples/petstore.mcp.yaml");
    const host = createMcpHost({ manifest });
    const http = await startHttpHost(host);

    try {
      const ready = await fetch(`${http.url}/readyz`).then((res) => res.json());
      expect(ready).toMatchObject({
        ok: true,
        server: "ai.quickdeploy/petstore",
        engine: { name: "openapi-2-mcp", version: "0.1.0" },
      });

      const initialize = await postRpc(http.url, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      });
      expect(initialize.result.serverInfo.name).toBe("ai.quickdeploy/petstore");
      expect(initialize.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);

      const tools = await postRpc(http.url, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });
      expect(tools.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
        "get_pet",
        "create_pet",
      ]);
    } finally {
      await http.close();
    }
  });

  it("default-denies streamable HTTP manifests without deployment auth", async () => {
    const manifest = await loadManifestFile("examples/petstore.mcp.yaml");
    manifest.deployment.auth = undefined;
    const host = createMcpHost({ manifest });
    const http = await startHttpHost(host);

    try {
      const response = await fetch(`${http.url}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "ping", method: "ping" }),
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Bearer");
      expect(body.error.message).toMatch(/requires deployment.auth/);
    } finally {
      await http.close();
    }
  });

  it("requires configured bearer auth for hosted streamable HTTP", async () => {
    const manifest = await loadManifestFile("examples/petstore.mcp.yaml");
    manifest.deployment.auth = { type: "bearer", tokenFrom: { env: "PETSTORE_MCP_TOKEN" } };
    const host = createMcpHost({
      manifest,
      env: { ...process.env, PETSTORE_MCP_TOKEN: "secret-token" },
    });
    const http = await startHttpHost(host);

    try {
      const missing = await fetch(`${http.url}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "ping", method: "ping" }),
      });
      expect(missing.status).toBe(401);
      expect(missing.headers.get("www-authenticate")).toContain("invalid_token");

      const ping = await postRpc(
        http.url,
        { jsonrpc: "2.0", id: "ping", method: "ping" },
        { authorization: "Bearer secret-token" },
      );
      expect(ping.result).toEqual({});
    } finally {
      await http.close();
    }
  });

  it("requires a bearer token when hosted auth is delegated", async () => {
    const manifest = await loadManifestFile("examples/petstore.mcp.yaml");
    manifest.deployment.auth = { type: "bearer" };
    const host = createMcpHost({ manifest, env: {} });
    const http = await startHttpHost(host);

    try {
      const missing = await fetch(`${http.url}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "ping", method: "ping" }),
      });
      expect(missing.status).toBe(401);
      expect(missing.headers.get("www-authenticate")).toContain("invalid_token");

      const ping = await postRpc(
        http.url,
        { jsonrpc: "2.0", id: "ping", method: "ping" },
        { authorization: "Bearer delegated-token" },
      );
      expect(ping.result).toEqual({});
    } finally {
      await http.close();
    }
  });

  it("emits OAuth resource metadata in the auth challenge", async () => {
    const manifest = await loadManifestFile("examples/petstore.mcp.yaml");
    manifest.deployment.auth = {
      type: "oauth2-resource",
      resourceMetadataUrl: "https://mcp.quickdeploy.ai/.well-known/oauth-protected-resource",
      requiredScopes: ["mcp:call"],
    };
    const host = createMcpHost({ manifest });
    const http = await startHttpHost(host);

    try {
      const response = await fetch(`${http.url}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "ping", method: "ping" }),
      });

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain(
        'resource_metadata="https://mcp.quickdeploy.ai/.well-known/oauth-protected-resource"',
      );
    } finally {
      await http.close();
    }
  });

  it("serves stdio content-length framed JSON-RPC", async () => {
    const manifest = await loadManifestFile("examples/petstore.mcp.yaml");
    const host = createMcpHost({ manifest });
    const input = Readable.from([frame({ jsonrpc: "2.0", id: "tools", method: "tools/list" })]);
    const chunks: string[] = [];
    const output = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk).toString("utf8"));
        callback();
      },
    });

    await runStdioHost(host, input, output);
    const [response] = await collectFrames(chunks.join(""));

    expect(response.id).toBe("tools");
    expect(response.result.tools[0].name).toBe("get_pet");
  });

  it("hosts a pinned git Python manifest and respects the function allowlist exactly", async () => {
    const manifest = await loadManifestFile("examples/git-fixture.mcp.yaml");
    const host = createMcpHost({
      manifest,
      userConfig: {
        packageRoot: fixturePackageRoot(),
      },
      gitSandboxRunner: fixtureGitRunner(),
    });

    const tools = await host.handleJsonRpc({
      jsonrpc: "2.0",
      id: "tools",
      method: "tools/list",
    });
    expect(tools).toMatchObject({
      result: {
        tools: [
          expect.objectContaining({ name: "fixture_add" }),
          expect.objectContaining({ name: "fixture_slugify" }),
        ],
      },
    });
    expect((tools as any).result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "fixture_add",
      "fixture_slugify",
    ]);

    const result = await host.handleJsonRpc({
      jsonrpc: "2.0",
      id: "call",
      method: "tools/call",
      params: {
        name: "fixture_add",
        arguments: {
          left: 13,
          right: 29,
        },
      },
    });
    expect(result).toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: "42",
          },
        ],
      },
    });

    await expect(
      host.handleJsonRpc({
        jsonrpc: "2.0",
        id: "denied",
        method: "tools/call",
        params: {
          name: "python_summarize",
          arguments: { items: ["not", "selected"] },
        },
      }),
    ).resolves.toMatchObject({
      error: {
        message: "Unknown tool python_summarize.",
      },
    });
  }, 30_000);

  it("hosts the committed qdai-git-fixture manifest with every lib method as a tool", async () => {
    const manifest = await loadCommittedManifest("registry/quickdeploy/qdai-git-fixture.mcp.json");
    const host = createMcpHost({
      manifest,
      userConfig: {
        packageRoot: fixturePackageRoot(),
      },
      gitSandboxRunner: fixtureGitRunner(),
    });

    const tools = await host.handleJsonRpc({
      jsonrpc: "2.0",
      id: "tools",
      method: "tools/list",
    });
    expect((tools as any).result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "fixture_add",
      "fixture_slugify",
      "fixture_summarize",
      "fixture_guess_kind",
      "fixture_text_initials",
      "fixture_text_repeat",
    ]);

    const add = await host.handleJsonRpc({
      jsonrpc: "2.0",
      id: "add",
      method: "tools/call",
      params: { name: "fixture_add", arguments: { left: 13, right: 29 } },
    });
    expect(add).toMatchObject({ result: { content: [{ type: "text", text: "42" }] } });

    const initials = await host.handleJsonRpc({
      jsonrpc: "2.0",
      id: "initials",
      method: "tools/call",
      params: { name: "fixture_text_initials", arguments: { value: "quick deploy ai" } },
    });
    expect(initials).toMatchObject({ result: { content: [{ type: "text", text: "QDA" }] } });

    const repeat = await host.handleJsonRpc({
      jsonrpc: "2.0",
      id: "repeat",
      method: "tools/call",
      params: { name: "fixture_text_repeat", arguments: { value: "ab", count: 3 } },
    });
    expect(repeat).toMatchObject({ result: { content: [{ type: "text", text: "ababab" }] } });
  }, 30_000);

  it("serves committed root MCP manifest examples over streamable HTTP", async () => {
    const cases = [
      {
        path: "registry/quickdeploy/petstore.mcp.json",
        env: { PETSTORE_API_TOKEN: "test-token" },
        userConfig: {},
        tools: ["get_pet", "create_pet"],
        resources: [],
        prompts: [],
      },
      {
        path: "registry/quickdeploy/grpc-greeter.mcp.json",
        env: {},
        userConfig: { endpoint: "127.0.0.1:50051" },
        tools: [
          "quickdeploy_fixture_greeter_say_hello",
          "quickdeploy_fixture_greeter_describe_profile",
        ],
        resources: [],
        prompts: [],
      },
      {
        path: "registry/quickdeploy/wsdl-calculator.mcp.json",
        env: {},
        userConfig: {},
        tools: ["calculator_add"],
        resources: [],
        prompts: [],
      },
      {
        path: "registry/quickdeploy/quickdeploy-skills.mcp.json",
        env: {},
        tools: ["browser_run"],
        resources: [],
        prompts: ["design_agentic_eval"],
      },
      {
        path: "registry/quickdeploy/postman-petstore.mcp.json",
        env: {
          PETSTORE_API_TOKEN: "test-token",
          PETSTORE_API_KEY: "test-key",
        },
        userConfig: {},
        tools: ["postman_get_pet", "postman_create_pet"],
        resources: [],
        prompts: [],
      },
      {
        path: "registry/quickdeploy/har-petstore.mcp.json",
        env: {},
        userConfig: {},
        tools: ["har_get_pet", "har_create_pet"],
        resources: [],
        prompts: [],
      },
      {
        path: "registry/quickdeploy/product-feed.mcp.json",
        env: {},
        userConfig: {},
        tools: ["search_product_feed"],
        resources: ["product_feed_item"],
        prompts: [],
      },
      {
        path: "registry/quickdeploy/agent-skills.mcp.json",
        env: {},
        userConfig: {},
        tools: ["browser_run"],
        resources: [],
        prompts: ["design_agentic_eval"],
      },
    ];

    for (const example of cases) {
      const manifest = await loadCommittedManifest(example.path);
      const host = createMcpHost({
        manifest,
        userConfig: example.userConfig,
        env: { ...process.env, ...example.env },
      });
      const http = await startHttpHost(host);

      try {
        const ready = await fetch(`${http.url}/readyz`).then((res) => res.json());
        expect(ready).toMatchObject({
          ok: true,
          server: manifest.metadata.name,
          transport: "streamable-http",
        });

        const initialize = await postRpc(http.url, {
          jsonrpc: "2.0",
          id: `${example.path}:initialize`,
          method: "initialize",
          params: {},
        });
        expect(initialize.result.serverInfo.name).toBe(manifest.metadata.name);

        const tools = await postRpc(http.url, {
          jsonrpc: "2.0",
          id: `${example.path}:tools`,
          method: "tools/list",
        });
        expect(tools.result.tools.map((tool: { name: string }) => tool.name)).toEqual(
          example.tools,
        );

        const resources = await postRpc(http.url, {
          jsonrpc: "2.0",
          id: `${example.path}:resources`,
          method: "resources/list",
        });
        expect(
          resources.result.resources.map((resource: { name: string }) => resource.name),
        ).toEqual(example.resources);

        const prompts = await postRpc(http.url, {
          jsonrpc: "2.0",
          id: `${example.path}:prompts`,
          method: "prompts/list",
        });
        expect(prompts.result.prompts.map((prompt: { name: string }) => prompt.name)).toEqual(
          example.prompts,
        );
      } finally {
        await http.close();
      }
    }
  });

  it("fails fast when importer version pinning is incompatible", async () => {
    const manifest = McpManifestSchema.parse({
      apiVersion: "quickdeploy.ai/v1",
      kind: "McpManifest",
      metadata: {
        name: "ai.quickdeploy/petstore",
        version: "1.0.0",
      },
      spec: {
        importer: {
          engine: "openapi-2-mcp",
          versionRange: "^9.0.0",
        },
        source: {
          type: "http",
          uri: "https://petstore3.swagger.io/api/v3/openapi.json",
        },
        select: {
          requests: [
            {
              method: "get",
              uriTemplate: "/pet/{petId}",
            },
          ],
        },
      },
      deployment: {
        transport: "streamable-http",
      },
    });

    expect(() => createMcpHost({ manifest })).toThrow(/does not satisfy manifest range \^9\.0\.0/);
  });

  it("validates required deployment config before serving", async () => {
    const manifest = await loadManifestFile("examples/petstore.mcp.yaml");
    manifest.deployment.configSchema = {
      type: "object",
      required: ["tenant"],
      properties: { tenant: { type: "string" } },
    };

    expect(() => createMcpHost({ manifest })).toThrow(/Missing required config field "tenant"/);
  });

  it("validates importer config against the referenced importer before serving", async () => {
    const manifest = await loadManifestFile("examples/petstore.mcp.yaml");
    manifest.spec.config = {
      schema: {
        type: "object",
        properties: {
          requestTimeoutMs: { type: "number" },
        },
      },
      defaults: {
        requestTimeoutMs: "slow",
      },
    };

    expect(() => createMcpHost({ manifest })).toThrow(
      /openapi-2-mcp config field "requestTimeoutMs": expected number/,
    );
  });

  it("validates required deployment bearer token before serving", async () => {
    const manifest = await loadManifestFile("examples/petstore.mcp.yaml");
    manifest.deployment.auth = { type: "bearer", tokenFrom: { env: "PETSTORE_MCP_TOKEN" } };

    expect(() => createMcpHost({ manifest, env: {} })).toThrow(
      /Missing required deployment auth environment variable PETSTORE_MCP_TOKEN/,
    );
  });
});

async function postRpc(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<any> {
  const response = await fetch(`${url}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return response.json();
}

function frame(payload: unknown): string {
  const chunks: string[] = [];
  writeStdioFrame(
    new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk).toString("utf8"));
        callback();
      },
    }),
    payload,
  );
  return chunks.join("");
}

async function collectFrames(payload: string): Promise<any[]> {
  const frames = [];
  for await (const frame of readStdioFrames(Readable.from([payload]))) {
    frames.push(frame);
  }
  return frames;
}

async function loadCommittedManifest(manifestPath: string) {
  const absoluteManifestPath = resolve(rootDir, manifestPath);
  return validateMcpManifestImporterConfig(
    JSON.parse(await readFile(absoluteManifestPath, "utf8")),
  );
}

function fixtureGitRunner(): SandboxRunner {
  const tools: PythonFunctionTool[] = [
    pythonTool("python_add", "add", ["left", "right"]),
    pythonTool("python_slugify", "slugify", ["value"]),
    pythonTool("python_summarize", "summarize", ["items"]),
    pythonTool("python_guess_kind", "guess_kind", ["value"]),
    pythonTool("python_texttools_initials", "TextTools.initials", ["value"]),
    pythonTool("python_texttools_repeat", "TextTools.repeat", ["value", "count"]),
  ];

  return {
    async inspect(request) {
      return tools
        .filter((tool) => tool.module === request.module)
        .slice(0, request.maxTools);
    },
    async call(request) {
      switch (request.functionName) {
        case "add":
          return Number(request.args[0]) + Number(request.args[1]);
        case "slugify":
          return String(request.args[0]).toLowerCase().replace(/\s+/g, "-");
        case "summarize":
          return {
            count: (request.args[0] as unknown[]).length,
            characters: (request.args[0] as string[]).join("").length,
          };
        case "guess_kind":
          return typeof request.args[0];
        case "TextTools.initials":
          return String(request.args[0])
            .split(/\s+/)
            .map((part) => part[0]?.toUpperCase() ?? "")
            .join("");
        case "TextTools.repeat":
          return String(request.args[0]).repeat(Number(request.args[1]));
        default:
          throw new Error(`Unexpected fixture function: ${request.functionName}`);
      }
    },
    async runCode() {
      throw new Error("mcp-host tests should not expose run_code");
    },
  };
}

function pythonTool(
  name: string,
  functionName: string,
  required: readonly string[],
): PythonFunctionTool {
  return {
    name,
    module: "qdai_git_fixture",
    functionName,
    description: `Call ${functionName}.`,
    inputSchema: {
      type: "object",
      properties: Object.fromEntries(required.map((key) => [key, {}])),
      required,
    },
  };
}
