export type CredentialSource =
  | { readonly env: string }
  | { readonly valueFrom: { readonly env: string } }
  | { readonly value: string };

export class ImporterConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImporterConfigError";
  }
}

export type EnvCredentialSource = {
  env: string;
};

export type SecuritySchemeBinding = {
  securityScheme?: string;
};

export type CredentialPlacement = "header" | "query" | "cookie";

export type BearerCredential = SecuritySchemeBinding & {
  type: "bearer";
  valueFrom: EnvCredentialSource;
};

export type OAuth2Credential = SecuritySchemeBinding & {
  type: "oauth2";
  valueFrom: EnvCredentialSource;
};

export type BasicCredential = SecuritySchemeBinding & {
  type: "basic";
  valueFrom: EnvCredentialSource;
};

export type ApiKeyCredential = SecuritySchemeBinding & {
  type: "api-key";
  valueFrom: EnvCredentialSource;
  name: string;
  in: CredentialPlacement;
};

export type ResolvedCredential =
  | (BearerCredential & { value: string })
  | (OAuth2Credential & { value: string })
  | (BasicCredential & { value: string })
  | (ApiKeyCredential & { value: string });

export type CredentialRequestPatch = {
  headers: Record<string, string>;
  query: Record<string, string>;
  cookies: Record<string, string>;
};

export type BearerAuthConfig = {
  readonly type: "bearer";
  readonly token: CredentialSource;
  readonly headerName?: string;
  readonly scheme?: string;
};

export type ApiKeyAuthConfig = {
  readonly type: "apiKey";
  readonly in: "header" | "query";
  readonly name: string;
  readonly value: CredentialSource;
};

export type BasicAuthConfig = {
  readonly type: "basic";
  readonly username: CredentialSource;
  readonly password: CredentialSource;
};

export type OAuth2ClientCredentialsAuthConfig = {
  readonly type: "oauth2ClientCredentials";
  readonly accessToken: CredentialSource;
  readonly headerName?: string;
  readonly scheme?: string;
};

export type CredentialAuthConfig =
  | BearerAuthConfig
  | ApiKeyAuthConfig
  | BasicAuthConfig
  | OAuth2ClientCredentialsAuthConfig;

export type AppliedCredentialAuth = {
  readonly headers: Record<string, string>;
  readonly query: Record<string, string>;
  readonly metadata: Record<string, string>;
};

export type AuthEnvironmentVariable = {
  readonly name: string;
  readonly isSecret: true;
  readonly description: string;
};

export function envCredential(env: string): CredentialSource {
  return { env };
}

export function manifestEnvCredential(env: string): CredentialSource {
  return { valueFrom: { env } };
}

export function resolveCredential(
  source: CredentialSource,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if ("value" in source) return source.value;

  const name = "env" in source ? source.env : source.valueFrom.env;
  const value = env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required credential environment variable ${name}`);
  }
  return value;
}

export function readEnvCredential<
  T extends BearerCredential | OAuth2Credential | BasicCredential | ApiKeyCredential,
>(credential: T, env: NodeJS.ProcessEnv = process.env): T & { value: string } {
  const value = env[credential.valueFrom.env];
  if (!value) {
    throw new ImporterConfigError(
      `Missing required auth environment variable ${credential.valueFrom.env} for ${credential.type} auth.`,
    );
  }
  return { ...credential, value };
}

export function applyCredentialAuth(
  configs: readonly CredentialAuthConfig[],
  env: NodeJS.ProcessEnv = process.env,
): AppliedCredentialAuth {
  const headers: Record<string, string> = {};
  const query: Record<string, string> = {};

  for (const config of configs) {
    switch (config.type) {
      case "bearer": {
        headers[config.headerName ?? "Authorization"] =
          `${config.scheme ?? "Bearer"} ${resolveCredential(config.token, env)}`;
        break;
      }
      case "apiKey": {
        const value = resolveCredential(config.value, env);
        if (config.in === "header") {
          headers[config.name] = value;
        } else {
          query[config.name] = value;
        }
        break;
      }
      case "basic": {
        const user = resolveCredential(config.username, env);
        const password = resolveCredential(config.password, env);
        headers.Authorization = `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
        break;
      }
      case "oauth2ClientCredentials": {
        headers[config.headerName ?? "Authorization"] =
          `${config.scheme ?? "Bearer"} ${resolveCredential(config.accessToken, env)}`;
        break;
      }
    }
  }

  return {
    headers,
    query,
    metadata: headersToMetadata(headers),
  };
}

export function applyCredentialToRequest(credential: ResolvedCredential): CredentialRequestPatch {
  switch (credential.type) {
    case "bearer":
    case "oauth2":
      return {
        headers: { Authorization: `Bearer ${credential.value}` },
        query: {},
        cookies: {},
      };
    case "basic":
      return {
        headers: { Authorization: `Basic ${Buffer.from(credential.value).toString("base64")}` },
        query: {},
        cookies: {},
      };
    case "api-key":
      return applyApiKeyCredential(credential);
  }
}

export function authEnvironmentVariables(
  configs: readonly CredentialAuthConfig[],
): AuthEnvironmentVariable[] {
  const byName = new Map<string, AuthEnvironmentVariable>();
  for (const config of configs) {
    for (const [source, description] of credentialDescriptions(config)) {
      const name = sourceEnvName(source);
      if (name && !byName.has(name)) {
        byName.set(name, { name, isSecret: true, description });
      }
    }
  }
  return [...byName.values()];
}

export function redactCredentialValues(
  text: string,
  configs: readonly CredentialAuthConfig[] | readonly ResolvedCredential[],
  env: NodeJS.ProcessEnv = process.env,
): string {
  let redacted = text;
  for (const config of configs) {
    if ("value" in config && typeof config.value === "string") {
      if (config.value) redacted = redacted.split(config.value).join("[REDACTED]");
      continue;
    }

    for (const [source] of credentialDescriptions(config as CredentialAuthConfig)) {
      try {
        const value = resolveCredential(source, env);
        if (value) redacted = redacted.split(value).join("[REDACTED]");
      } catch {
        // Missing credentials do not add redactable material.
      }
    }
  }
  return redacted;
}

function applyApiKeyCredential(
  credential: ApiKeyCredential & { value: string },
): CredentialRequestPatch {
  switch (credential.in) {
    case "header":
      return { headers: { [credential.name]: credential.value }, query: {}, cookies: {} };
    case "query":
      return { headers: {}, query: { [credential.name]: credential.value }, cookies: {} };
    case "cookie":
      return { headers: {}, query: {}, cookies: { [credential.name]: credential.value } };
  }
}

function headersToMetadata(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
}

function sourceEnvName(source: CredentialSource): string | undefined {
  if ("env" in source) return source.env;
  if ("valueFrom" in source) return source.valueFrom.env;
  return undefined;
}

function credentialDescriptions(
  config: CredentialAuthConfig,
): Array<readonly [CredentialSource, string]> {
  switch (config.type) {
    case "bearer":
      return [[config.token, `Bearer token for ${config.headerName ?? "Authorization"}`]];
    case "apiKey":
      return [[config.value, `API key for ${config.in} ${config.name}`]];
    case "basic":
      return [
        [config.username, "Basic authentication username"],
        [config.password, "Basic authentication password"],
      ];
    case "oauth2ClientCredentials":
      return [[config.accessToken, "OAuth2 client-credentials access token"]];
  }
}
