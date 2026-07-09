export type EnvSecretRef = {
  env: string;
};

export type BearerCredentialBinding = {
  type: "bearer";
  token: EnvSecretRef;
};

export type ApiKeyCredentialBinding = {
  type: "api-key";
  in: "header" | "query";
  name: string;
  value: EnvSecretRef;
};

export type BasicCredentialBinding = {
  type: "basic";
  username: EnvSecretRef;
  password: EnvSecretRef;
};

export type OAuth2ClientCredentialsBinding = {
  type: "oauth2-client-credentials";
  tokenUrl: string;
  clientId: EnvSecretRef;
  clientSecret: EnvSecretRef;
  scopes?: string[];
};

export type CredentialBinding =
  | BearerCredentialBinding
  | ApiKeyCredentialBinding
  | BasicCredentialBinding
  | OAuth2ClientCredentialsBinding;

export type OAuth2TokenRequest = {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
};

export type OAuth2TokenResponse = {
  accessToken: string;
  tokenType?: "Bearer" | string;
};

export type ResolveCredentialOptions = {
  env?: Record<string, string | undefined>;
  requestOAuth2Token?: (request: OAuth2TokenRequest) => Promise<OAuth2TokenResponse>;
};

export type ResolvedCredentialBindings = {
  headers: Record<string, string>;
  query: Record<string, string>;
  secrets: string[];
};

export type CredentialEnvironmentVariable = {
  name: string;
  isSecret: true;
};

export type McpManifestAuthLike =
  | {
      type: "bearer";
      valueFrom: EnvSecretRef;
    }
  | {
      type: "api-key";
      in?: "header" | "query";
      name?: string;
      valueFrom: EnvSecretRef;
    }
  | {
      type: "basic";
      usernameFrom?: EnvSecretRef;
      passwordFrom?: EnvSecretRef;
      valueFrom?: EnvSecretRef;
    }
  | {
      type: "oauth2";
      tokenUrl?: string;
      clientIdFrom?: EnvSecretRef;
      clientSecretFrom?: EnvSecretRef;
      scopes?: string[];
      valueFrom?: EnvSecretRef;
    };

export type OpenApiSecuritySchemeLike = {
  type?: unknown;
  scheme?: unknown;
  in?: unknown;
  name?: unknown;
  flows?: unknown;
};

export async function resolveCredentialBindings(
  bindings: CredentialBinding[],
  options: ResolveCredentialOptions = {},
): Promise<ResolvedCredentialBindings> {
  const headers: Record<string, string> = {};
  const query: Record<string, string> = {};
  const secrets: string[] = [];

  for (const binding of bindings) {
    switch (binding.type) {
      case "bearer": {
        const token = readRequiredEnv(binding.token, options.env);
        headers.authorization = `Bearer ${token}`;
        secrets.push(token);
        break;
      }
      case "api-key": {
        const value = readRequiredEnv(binding.value, options.env);
        if (binding.in === "header") {
          headers[binding.name.toLowerCase()] = value;
        } else {
          query[binding.name] = value;
        }
        secrets.push(value);
        break;
      }
      case "basic": {
        const username = readRequiredEnv(binding.username, options.env);
        const password = readRequiredEnv(binding.password, options.env);
        const encoded = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
        const value = `Basic ${encoded}`;
        headers.authorization = value;
        secrets.push(username, password, encoded);
        break;
      }
      case "oauth2-client-credentials": {
        if (!options.requestOAuth2Token) {
          throw new Error("OAuth2 client-credentials auth requires requestOAuth2Token.");
        }
        const clientId = readRequiredEnv(binding.clientId, options.env);
        const clientSecret = readRequiredEnv(binding.clientSecret, options.env);
        const response = await options.requestOAuth2Token({
          tokenUrl: binding.tokenUrl,
          clientId,
          clientSecret,
          ...(binding.scopes ? { scopes: binding.scopes } : {}),
        });
        const tokenType = response.tokenType ?? "Bearer";
        headers.authorization = `${tokenType} ${response.accessToken}`;
        secrets.push(clientId, clientSecret, response.accessToken);
        break;
      }
    }
  }

  return { headers, query, secrets: unique(secrets.filter(Boolean)) };
}

export function applyCredentialBindingsToUrl(
  url: string,
  resolved: Pick<ResolvedCredentialBindings, "query">,
): string {
  const parsed = new URL(url);
  for (const [name, value] of Object.entries(resolved.query)) {
    parsed.searchParams.set(name, value);
  }
  return parsed.toString();
}

export function redactCredentialSecrets(
  value: string,
  resolved: Pick<ResolvedCredentialBindings, "secrets">,
): string {
  return resolved.secrets.reduce(
    (current, secret) => current.split(secret).join("[REDACTED]"),
    value,
  );
}

export function credentialEnvironmentVariables(
  bindings: CredentialBinding[],
): CredentialEnvironmentVariable[] {
  return unique(
    bindings.flatMap((binding) => {
      switch (binding.type) {
        case "bearer":
          return [binding.token.env];
        case "api-key":
          return [binding.value.env];
        case "basic":
          return [binding.username.env, binding.password.env];
        case "oauth2-client-credentials":
          return [binding.clientId.env, binding.clientSecret.env];
      }
    }),
  ).map((name) => ({ name, isSecret: true }));
}

export function credentialBindingsFromMcpAuth(auth: McpManifestAuthLike[]): CredentialBinding[] {
  return auth.map((entry) => {
    switch (entry.type) {
      case "bearer":
        return { type: "bearer", token: entry.valueFrom };
      case "api-key":
        return {
          type: "api-key",
          in: entry.in ?? "header",
          name: entry.name ?? "x-api-key",
          value: entry.valueFrom,
        };
      case "basic":
        if (entry.usernameFrom && entry.passwordFrom) {
          return {
            type: "basic",
            username: entry.usernameFrom,
            password: entry.passwordFrom,
          };
        }
        if (entry.valueFrom) {
          return {
            type: "bearer",
            token: entry.valueFrom,
          };
        }
        throw new Error("basic auth requires usernameFrom and passwordFrom.");
      case "oauth2":
        if (entry.tokenUrl && entry.clientIdFrom && entry.clientSecretFrom) {
          return {
            type: "oauth2-client-credentials",
            tokenUrl: entry.tokenUrl,
            clientId: entry.clientIdFrom,
            clientSecret: entry.clientSecretFrom,
            ...(entry.scopes ? { scopes: entry.scopes } : {}),
          };
        }
        if (entry.valueFrom) {
          return { type: "bearer", token: entry.valueFrom };
        }
        throw new Error("oauth2 auth requires client credentials or valueFrom.");
    }
  });
}

export function credentialBindingsFromOpenApiSecuritySchemes(
  securitySchemes: Record<string, OpenApiSecuritySchemeLike>,
): CredentialBinding[] {
  const bindings: CredentialBinding[] = [];
  for (const [schemeName, scheme] of Object.entries(securitySchemes)) {
    if (scheme.type === "http" && lowerString(scheme.scheme) === "bearer") {
      bindings.push({ type: "bearer", token: { env: `${toEnvPrefix(schemeName)}_TOKEN` } });
      continue;
    }

    if (scheme.type === "http" && lowerString(scheme.scheme) === "basic") {
      const prefix = toEnvPrefix(schemeName);
      bindings.push({
        type: "basic",
        username: { env: `${prefix}_USERNAME` },
        password: { env: `${prefix}_PASSWORD` },
      });
      continue;
    }

    if (
      scheme.type === "apiKey" &&
      (scheme.in === "header" || scheme.in === "query") &&
      typeof scheme.name === "string" &&
      scheme.name.length > 0
    ) {
      bindings.push({
        type: "api-key",
        in: scheme.in,
        name: scheme.name,
        value: { env: `${toEnvPrefix(schemeName)}_API_KEY` },
      });
      continue;
    }

    const clientCredentials = openApiClientCredentialsFlow(scheme);
    if (scheme.type === "oauth2" && clientCredentials) {
      const prefix = toEnvPrefix(schemeName);
      bindings.push({
        type: "oauth2-client-credentials",
        tokenUrl: clientCredentials.tokenUrl,
        clientId: { env: `${prefix}_CLIENT_ID` },
        clientSecret: { env: `${prefix}_CLIENT_SECRET` },
        ...(clientCredentials.scopes ? { scopes: clientCredentials.scopes } : {}),
      });
    }
  }
  return bindings;
}

function readRequiredEnv(
  ref: EnvSecretRef,
  env: Record<string, string | undefined> = process.env,
): string {
  const value = env[ref.env];
  if (!value) {
    throw new Error(`Missing required credential environment variable ${ref.env}.`);
  }
  return value;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function openApiClientCredentialsFlow(
  scheme: OpenApiSecuritySchemeLike,
): { tokenUrl: string; scopes?: string[] } | null {
  if (!isRecord(scheme.flows) || !isRecord(scheme.flows.clientCredentials)) {
    return null;
  }
  const flow = scheme.flows.clientCredentials;
  if (typeof flow.tokenUrl !== "string" || flow.tokenUrl.length === 0) {
    return null;
  }
  const scopes = isRecord(flow.scopes) ? Object.keys(flow.scopes) : undefined;
  return { tokenUrl: flow.tokenUrl, ...(scopes && scopes.length > 0 ? { scopes } : {}) };
}

function lowerString(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function toEnvPrefix(value: string): string {
  const prefix = value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return prefix.length > 0 ? prefix : "OPENAPI_AUTH";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
