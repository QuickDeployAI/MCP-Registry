import {
  credentialBindingsFromMcpAuth,
  credentialEnvironmentVariables,
} from "@quickdeployai/importer-core";
import type { McpProjectionConfig } from "@quickdeployai/registry-schemas/mcp-projection";
import { ConfigValidationError } from "./errors";

export type HostConfig = {
  values: Record<string, unknown>;
  secrets: Record<string, string>;
};

export function resolveHostConfig(
  projection: McpProjectionConfig,
  userConfig: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): HostConfig {
  const defaults = projection.config?.defaults ?? {};
  const values = { ...defaults, ...userConfig };
  const schema = projection.deployment.configSchema ?? projection.config?.schema;
  validateJsonSchemaLike(schema, values, "config");

  const secrets: Record<string, string> = {};
  for (const auth of projection.auth) {
    const variables = credentialEnvironmentVariables(credentialBindingsFromMcpAuth([auth]));
    for (const variable of variables) {
      const value = env[variable.name];
      if (!value) {
        throw new ConfigValidationError(
          `Missing required auth environment variable ${variable.name} for ${auth.type} auth.`,
        );
      }
      secrets[variable.name] = value;
    }
  }

  const inboundAuth = projection.deployment.auth;
  if (inboundAuth?.type === "bearer" && inboundAuth.tokenFrom) {
    const envName = inboundAuth.tokenFrom.env;
    const value = env[envName];
    if (!value) {
      throw new ConfigValidationError(
        `Missing required deployment auth environment variable ${envName}.`,
      );
    }
    secrets[envName] = value;
  }

  if (inboundAuth?.type === "oauth2-resource" && inboundAuth.tokenFrom) {
    const envName = inboundAuth.tokenFrom.env;
    const value = env[envName];
    if (!value) {
      throw new ConfigValidationError(
        `Missing required deployment auth environment variable ${envName}.`,
      );
    }
    secrets[envName] = value;
  }

  return { values, secrets };
}

function validateJsonSchemaLike(
  schema: unknown,
  values: Record<string, unknown>,
  label: string,
): void {
  if (!isRecord(schema)) return;

  const required = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === "string")
    : [];
  for (const key of required) {
    if (values[key] === undefined) {
      throw new ConfigValidationError(`Missing required ${label} field "${key}".`);
    }
  }

  const properties = isRecord(schema.properties) ? schema.properties : {};
  for (const [key, property] of Object.entries(properties)) {
    if (values[key] === undefined || !isRecord(property)) continue;
    const expectedType = property.type;
    if (typeof expectedType !== "string") continue;
    if (!matchesJsonType(values[key], expectedType)) {
      throw new ConfigValidationError(`Invalid ${label} field "${key}": expected ${expectedType}.`);
    }
  }
}

function matchesJsonType(value: unknown, type: string): boolean {
  switch (type) {
    case "array":
      return Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number";
    case "object":
      return isRecord(value);
    case "string":
      return typeof value === "string";
    default:
      return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
