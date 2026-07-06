import { z } from "zod";
import type { JsonSchemaLike } from "./schema.js";
import { schemaToZod } from "./schema.js";
import type { ProxyExecutor } from "./executor.js";

export type ProxyTool = {
  name: string;
  description: string;
  parameters: z.ZodObject<z.ZodRawShape>;
  execute(args: unknown): Promise<string>;
};

export type ProxyParameter = {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: JsonSchemaLike;
};

export type ProxyRequestBody = {
  required?: boolean;
  description?: string;
  schema?: JsonSchemaLike;
};

export type ProxyOperation = {
  method: string;
  path: string;
  name?: string;
  summary?: string;
  description?: string;
  parameters?: readonly ProxyParameter[];
  requestBody?: ProxyRequestBody;
};

export function mergeParams(
  shared: readonly ProxyParameter[],
  local: readonly ProxyParameter[],
): ProxyParameter[] {
  return [...shared, ...local].reduce<ProxyParameter[]>((acc, p) => {
    const i = acc.findIndex((x) => x.name === p.name && x.in === p.in);
    if (i >= 0) {
      acc[i] = p;
    } else {
      acc.push(p);
    }
    return acc;
  }, []);
}

export function fallbackToolName(method: string, path: string): string {
  return `${method}_${path.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

export function operationToTool(
  operation: ProxyOperation,
  shared: readonly ProxyParameter[],
  executor: ProxyExecutor,
): ProxyTool {
  const params = mergeParams(shared, operation.parameters ?? []);
  const pathParams = params.filter((p) => p.in === "path").map((p) => p.name);
  const headerKeys = params.filter((p) => p.in === "header").map((p) => p.name);

  const shape: Record<string, z.ZodTypeAny> = Object.fromEntries(
    params.map((p) => [
      p.name,
      schemaToZod(p.schema ?? {}, p.required ?? false).describe(p.description ?? ""),
    ]),
  );

  const bodySchema = operation.requestBody?.schema;
  const bodyKeys: string[] = [];

  if (bodySchema?.type === "object" && bodySchema.properties) {
    const required = bodySchema.required ?? [];
    for (const [k, v] of Object.entries(bodySchema.properties)) {
      shape[k] = schemaToZod(
        v,
        operation.requestBody?.required === true && required.includes(k),
      );
      bodyKeys.push(k);
    }
  } else if (bodySchema) {
    shape.body = schemaToZod(bodySchema, operation.requestBody?.required ?? false)
      .describe(operation.requestBody?.description ?? "Request body");
    bodyKeys.push("body");
  }

  return {
    name: operation.name ?? fallbackToolName(operation.method, operation.path),
    description:
      operation.description ??
      operation.summary ??
      `${operation.method.toUpperCase()} ${operation.path}`,
    parameters: z.object(shape),
    execute: (args) =>
      executor({
        method: operation.method,
        path: operation.path,
        pathParams,
        headerKeys,
        bodyKeys,
        args: args as Record<string, unknown>,
      }),
  };
}

export function operationsToTools(
  operations: readonly ProxyOperation[],
  executor: ProxyExecutor,
  shared: readonly ProxyParameter[] = [],
): ProxyTool[] {
  return operations.map((operation) => operationToTool(operation, shared, executor));
}
