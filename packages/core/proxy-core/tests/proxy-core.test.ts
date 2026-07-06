import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildBody,
  buildUrl,
  createHttpExecutor,
  fallbackToolName,
  mergeParams,
  operationToTool,
  schemaToZod,
} from "../src/index.js";
import type { ProxyExecutor } from "../src/index.js";

describe("schemaToZod", () => {
  it("maps primitives and required wrapping", () => {
    expect(schemaToZod({ type: "string" })).toBeInstanceOf(z.ZodOptional);
    expect(schemaToZod({ type: "string" }, true)).toBeInstanceOf(z.ZodString);
    expect(schemaToZod({ type: "number" }, true)).toBeInstanceOf(z.ZodNumber);
    expect(schemaToZod({ type: "integer" }, true)).toBeInstanceOf(z.ZodNumber);
    expect(schemaToZod({ type: "boolean" }, true)).toBeInstanceOf(z.ZodBoolean);
    expect(schemaToZod({}, true)).toBeInstanceOf(z.ZodUnknown);
  });

  it("maps arrays, objects, enums, and descriptions", () => {
    const array = schemaToZod({ type: "array", items: { type: "string" } }, true);
    expect(array).toBeInstanceOf(z.ZodArray);
    expect((array as z.ZodArray<z.ZodTypeAny>).element).toBeInstanceOf(z.ZodString);

    const object = schemaToZod({
      type: "object",
      properties: { name: { type: "string" }, age: { type: "integer" } },
      required: ["name"],
    }, true) as z.ZodObject<z.ZodRawShape>;
    expect(object.shape.name).toBeInstanceOf(z.ZodString);
    expect(object.shape.age).toBeInstanceOf(z.ZodOptional);

    expect(schemaToZod({ enum: ["a", "b"] }, true)).toBeInstanceOf(z.ZodEnum);
    expect(schemaToZod({ enum: ["only"] }, true)).toBeInstanceOf(z.ZodUnknown);
    expect(schemaToZod({ type: "string", description: "a name" }, true).description)
      .toBe("a name");
  });
});

describe("request helpers", () => {
  const base = "https://api.example.com";

  it("constructs URLs with path and query params", () => {
    const url = buildUrl(base, "/pets/{name}", {
      name: "hello world",
      status: "active",
      body: { ignored: true },
    }, ["name"], ["body"]);
    expect(url.pathname).toBe("/pets/hello%20world");
    expect(url.searchParams.get("status")).toBe("active");
    expect(url.searchParams.has("name")).toBe(false);
    expect(url.searchParams.has("body")).toBe(false);
  });

  it("builds request bodies from flattened keys", () => {
    expect(buildBody([], { name: "fido" })).toBeUndefined();
    const raw = { foo: "bar" };
    expect(buildBody(["body"], { body: raw })).toBe(raw);
    expect(buildBody(["name", "status"], { name: "fido", status: null }))
      .toEqual({ name: "fido" });
  });
});

describe("operationToTool", () => {
  it("merges parameters, flattens object body fields, and executes through the injected executor", async () => {
    const calls: unknown[] = [];
    const executor: ProxyExecutor = async (context) => {
      calls.push(context);
      return "ok";
    };

    const tool = operationToTool({
      method: "post",
      path: "/pets/{id}",
      name: "createPet",
      summary: "Create a pet",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "integer" } },
        { name: "x-tenant", in: "header", schema: { type: "string" }, description: "local" },
      ],
      requestBody: {
        required: true,
        schema: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            status: { type: "string", enum: ["active", "inactive"] },
          },
        },
      },
    }, [
      { name: "x-tenant", in: "header", schema: { type: "string" }, description: "shared" },
    ], executor);

    expect(tool.name).toBe("createPet");
    expect(tool.description).toBe("Create a pet");
    expect(tool.parameters.shape.id).toBeInstanceOf(z.ZodNumber);
    expect((tool.parameters.shape["x-tenant"] as z.ZodTypeAny).description).toBe("local");
    expect(tool.parameters.shape.name).toBeInstanceOf(z.ZodString);
    expect(tool.parameters.shape.status).toBeInstanceOf(z.ZodOptional);
    await expect(tool.execute({ id: 1, name: "Fido" })).resolves.toBe("ok");
    expect(calls).toEqual([{
      method: "post",
      path: "/pets/{id}",
      pathParams: ["id"],
      headerKeys: ["x-tenant"],
      bodyKeys: ["name", "status"],
      args: { id: 1, name: "Fido" },
    }]);
  });

  it("keeps fallback operation names and parameter dedupe stable", () => {
    expect(fallbackToolName("post", "/pets")).toBe("post__pets");
    expect(mergeParams([
      { name: "id", in: "query", description: "shared" },
    ], [
      { name: "id", in: "query", description: "local" },
    ])).toEqual([{ name: "id", in: "query", description: "local" }]);
  });
});

describe("createHttpExecutor", () => {
  it("formats JSON responses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{\"ok\":true}")) as typeof fetch;
    try {
      await expect(createHttpExecutor("https://api.example.com")({
        method: "get",
        path: "/status",
        pathParams: [],
        headerKeys: [],
        bodyKeys: [],
        args: {},
      })).resolves.toBe("{\n  \"ok\": true\n}");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("adds request augmentation headers and query without leaking header args into query", async () => {
    const originalFetch = globalThis.fetch;
    let actualUrl = "";
    let actualHeaders: unknown;
    globalThis.fetch = (async (input, init) => {
      actualUrl = String(input);
      actualHeaders = init?.headers;
      return new Response("ok");
    }) as typeof fetch;
    try {
      await createHttpExecutor("https://api.example.com", {
        augmentRequest: () => ({
          headers: { Authorization: "Bearer token" },
          query: { api_key: "query-token" },
        }),
      })({
        method: "get",
        path: "/status",
        pathParams: [],
        headerKeys: ["x-tenant"],
        bodyKeys: [],
        args: { "x-tenant": "tenant-1", filter: "active" },
      });
      const url = new URL(actualUrl);
      expect(url.searchParams.get("filter")).toBe("active");
      expect(url.searchParams.get("api_key")).toBe("query-token");
      expect(url.searchParams.has("x-tenant")).toBe(false);
      expect(actualHeaders).toMatchObject({ Authorization: "Bearer token" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
