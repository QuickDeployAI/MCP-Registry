import {
  readEnvCredential,
  type ApiKeyCredential,
  type BasicCredential,
  type BearerCredential,
  type OAuth2Credential,
  type ResolvedCredential,
} from "@quickdeployai/importer-core/auth";
import {
  credentialBindingsFromMcpAuth,
  type CredentialBinding,
} from "@quickdeployai/importer-core/bindings";
import {
  openApiToProxyTools,
  type HttpExecutor,
  type OpenApiProxyTool,
} from "@quickdeployai/proxy-core/openapi";
import {
  apiManifestDependencyAuthToMcpAuth,
  type McpManifestAuth,
} from "@quickdeployai/registry-schemas";
import type { OpenAPIV3 } from "openapi-types";
import {
  resolveApiManifestDependencies,
  type ApiManifestInput,
  type ResolveApiManifestDependenciesOptions,
  type ResolvedApiManifestDependency,
} from "./index.js";

export type BuildApiManifestToolsOptions = ResolveApiManifestDependenciesOptions & {
  /**
   * Per-dependency deployment base URL overrides. When omitted, each dependency's
   * `apiDeploymentBaseUrl` is used.
   */
  baseUrls?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
  executor?: HttpExecutor;
};

export type ApiManifestProxyTool = OpenApiProxyTool & {
  dependencyKey: string;
  operationName: string;
  auth: McpManifestAuth[];
  credentialBindings: CredentialBinding[];
};

export async function buildApiManifestTools(
  manifest: ApiManifestInput,
  options: BuildApiManifestToolsOptions = {},
): Promise<ApiManifestProxyTool[]> {
  const resolved = await resolveApiManifestDependencies(manifest, options);

  return resolved.flatMap((dependencyResolution) => {
    const baseUrl = resolveDependencyBaseUrl(dependencyResolution, options);
    const auth = apiManifestDependencyAuthToMcpAuth(
      dependencyResolution.dependencyKey,
      dependencyResolution.dependency,
    );
    const credentials = authToProxyCredentials(auth, options.env);
    const credentialBindings = credentialBindingsFromMcpAuth(auth);

    return openApiToProxyTools(dependencyResolution.selectedOpenApiDocument, baseUrl, {
      credentials,
      executor: options.executor,
      env: options.env,
    }).map((tool) =>
      namespaceTool(tool, {
        auth,
        credentialBindings,
        dependencyKey: dependencyResolution.dependencyKey,
      }),
    );
  });
}

function resolveDependencyBaseUrl(
  resolution: ResolvedApiManifestDependency,
  options: Pick<BuildApiManifestToolsOptions, "baseUrls">,
): string {
  const baseUrl =
    options.baseUrls?.[resolution.dependencyKey] ?? resolution.dependency.apiDeploymentBaseUrl;
  if (!baseUrl) {
    throw new Error(
      `API Manifest dependency "${resolution.dependencyKey}" is missing apiDeploymentBaseUrl.`,
    );
  }
  return baseUrl;
}

function namespaceTool(
  tool: OpenApiProxyTool,
  metadata: Pick<ApiManifestProxyTool, "auth" | "credentialBindings" | "dependencyKey">,
): ApiManifestProxyTool {
  return {
    ...tool,
    ...metadata,
    operationName: tool.name,
    name: `${metadata.dependencyKey}.${tool.name}`,
  };
}

function authToProxyCredentials(
  auth: readonly McpManifestAuth[],
  env: NodeJS.ProcessEnv = process.env,
): ResolvedCredential[] {
  return auth.map((entry) => readEnvCredential(mcpAuthToProxyCredential(entry), env));
}

function mcpAuthToProxyCredential(
  auth: McpManifestAuth,
): BearerCredential | OAuth2Credential | BasicCredential | ApiKeyCredential {
  switch (auth.type) {
    case "bearer":
      return { type: "bearer", valueFrom: auth.valueFrom };
    case "api-key":
      return {
        type: "api-key",
        in: auth.in,
        name: auth.name,
        valueFrom: auth.valueFrom,
      };
    case "oauth2":
      if (auth.valueFrom) return { type: "oauth2", valueFrom: auth.valueFrom };
      throw new Error("API Manifest OAuth2 client credentials require a token valueFrom binding.");
    case "basic":
      throw new Error("API Manifest basic auth requires a precomposed proxy credential binding.");
  }
}
