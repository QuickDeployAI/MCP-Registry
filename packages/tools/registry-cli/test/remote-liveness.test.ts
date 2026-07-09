import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { failedRemoteLivenessResults, validateRemoteLiveness } from "../src/remote-liveness";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("remote liveness validation", () => {
  it("passes reachable MCP remotes and auth-challenged remotes", async () => {
    const okUrl = await startRemote(async (request, response) => {
      const body = JSON.parse(await readRequestBody(request)) as { method?: string; id?: string };
      if (body.method === "initialize") {
        response.setHeader("Content-Type", "application/json");
        response.setHeader("Mcp-Session-Id", "session-fixture");
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              protocolVersion: "2025-11-25",
              serverInfo: { name: "fixture", version: "1.0.0" },
              capabilities: {},
            },
          }),
        );
        return;
      }
      response.statusCode = 202;
      response.end();
    });
    const authUrl = await startRemote(async (_request, response) => {
      response.statusCode = 401;
      response.setHeader(
        "WWW-Authenticate",
        'Bearer resource_metadata="https://auth.example/.well-known"',
      );
      response.end("authorization required");
    });
    const serverJsonPath = await writeServerJson([
      remoteEntry("ai.quickdeploy/ok", okUrl),
      remoteEntry("ai.quickdeploy/auth", authUrl),
    ]);

    const results = await validateRemoteLiveness({
      rootDir: process.cwd(),
      serverJsonPath,
      timeoutMs: 5_000,
    });

    expect(results).toEqual([
      expect.objectContaining({ serverName: "ai.quickdeploy/ok", status: "ok" }),
      expect.objectContaining({ serverName: "ai.quickdeploy/auth", status: "auth-required" }),
    ]);
    expect(failedRemoteLivenessResults(results)).toEqual([]);
  });

  it("treats unauthenticated initialize responses without auth headers as auth-required", async () => {
    const authUrl = await startRemote(async (_request, response) => {
      response.statusCode = 401;
      response.end("authorization required");
    });
    const serverJsonPath = await writeServerJson([remoteEntry("ai.quickdeploy/auth", authUrl)]);

    const results = await validateRemoteLiveness({
      rootDir: process.cwd(),
      serverJsonPath,
      timeoutMs: 1_000,
    });

    expect(results).toEqual([
      expect.objectContaining({ serverName: "ai.quickdeploy/auth", status: "auth-required" }),
    ]);
    expect(failedRemoteLivenessResults(results)).toEqual([]);
  });

  it("does not probe templated remote URLs that require runtime substitution", async () => {
    const okUrl = await startRemote(async (request, response) => {
      const body = JSON.parse(await readRequestBody(request)) as { method?: string; id?: string };
      if (body.method === "initialize") {
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              protocolVersion: "2025-11-25",
              serverInfo: { name: "fixture", version: "1.0.0" },
              capabilities: {},
            },
          }),
        );
        return;
      }
      response.statusCode = 202;
      response.end();
    });
    const serverJsonPath = await writeServerJson([
      remoteEntry("ai.quickdeploy/ok", okUrl),
      remoteEntry("ai.quickdeploy/template", "https://{workspace}.example.test/mcp"),
    ]);

    const results = await validateRemoteLiveness({
      rootDir: process.cwd(),
      serverJsonPath,
      timeoutMs: 1_000,
    });

    expect(results).toEqual([expect.objectContaining({ serverName: "ai.quickdeploy/ok" })]);
  });

  it("supports stateless streamable HTTP remotes without a session header", async () => {
    const initializedSessionIds: (string | undefined)[] = [];
    const okUrl = await startRemote(async (request, response) => {
      const body = JSON.parse(await readRequestBody(request)) as { method?: string; id?: string };
      if (body.method === "initialize") {
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              protocolVersion: "2025-11-25",
              serverInfo: { name: "fixture", version: "1.0.0" },
              capabilities: {},
            },
          }),
        );
        return;
      }
      if (body.method === "notifications/initialized") {
        const sessionId = request.headers["mcp-session-id"];
        initializedSessionIds.push(Array.isArray(sessionId) ? sessionId[0] : sessionId);
        response.statusCode = 202;
        response.end();
        return;
      }
      response.statusCode = 404;
      response.end();
    });
    const serverJsonPath = await writeServerJson([remoteEntry("ai.quickdeploy/ok", okUrl)]);

    const results = await validateRemoteLiveness({
      rootDir: process.cwd(),
      serverJsonPath,
      timeoutMs: 1_000,
    });

    expect(results).toEqual([
      expect.objectContaining({
        serverName: "ai.quickdeploy/ok",
        status: "ok",
        detail: "initialize completed",
      }),
    ]);
    expect(initializedSessionIds).toEqual([undefined]);
  });

  it("fails a broken remote fixture", async () => {
    const brokenUrl = await startRemote(async (_request, response) => {
      response.statusCode = 500;
      response.end("not an mcp endpoint");
    });
    const serverJsonPath = await writeServerJson([remoteEntry("ai.quickdeploy/broken", brokenUrl)]);

    const results = await validateRemoteLiveness({
      rootDir: process.cwd(),
      serverJsonPath,
      timeoutMs: 1_000,
    });

    expect(failedRemoteLivenessResults(results)).toEqual([
      expect.objectContaining({
        serverName: "ai.quickdeploy/broken",
        status: "failed",
        statusCode: 500,
      }),
    ]);
  });
});

async function startRemote(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
): Promise<string> {
  const server = createServer((request, response) => {
    handler(request, response).catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("fixture server did not bind a port");
  return `http://127.0.0.1:${address.port}/mcp`;
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function writeServerJson(entries: unknown[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "registry-cli-liveness-"));
  const path = join(dir, "servers.json");
  await writeFile(
    path,
    JSON.stringify(
      {
        $schema: "https://quickdeploy.ai/schemas/servers-json.schema.json",
        servers: entries,
      },
      null,
      2,
    ),
  );
  return path;
}

function remoteEntry(name: string, url: string): Record<string, unknown> {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    name,
    version: "1.0.0",
    description: `${name} fixture.`,
    remotes: [{ type: "streamable-http", url }],
  };
}
