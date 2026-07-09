import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { stringify } from "yaml";
import type { McpManifest } from "@quickdeployai/registry-schemas";

export const GENERATED_MCP_CODEGEN_ROOT = ".generated/mcp-codegen" as const;
export const OPENSHELL_MXC_POLICY_FILE = "openshell.policy.yaml" as const;

export const generatedMcpFamilies = ["openapi", "asyncapi", "grpc", "wsdl", "feed"] as const;
export type GeneratedMcpFamily = (typeof generatedMcpFamilies)[number];
export type GeneratedMcpLifecyclePhase = "build" | "test";

export type OpenShellMxcAvailability =
  | { ok: true; detail?: string }
  | { ok: false; reason: string };

export type OpenShellMxcCommand = {
  executable: "pnpm" | "node";
  args: readonly string[];
};

export type OpenShellMxcRunRequest = {
  runtime: {
    mxc: "required";
    openshell: "required";
  };
  family: GeneratedMcpFamily;
  provider: string;
  phase: GeneratedMcpLifecyclePhase;
  projectDir: string;
  command: OpenShellMxcCommand;
  policy: OpenShellMxcPolicy;
  policyYaml: string;
  env: {
    inherit: false;
    refs: readonly OpenShellMxcCredentialEnvRef[];
  };
  directHostExecution: "forbidden";
};

export type OpenShellMxcRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type OpenShellMxcRuntime = {
  kind: "openshell-mxc";
  checkAvailability(): Promise<OpenShellMxcAvailability>;
  run(request: OpenShellMxcRunRequest): Promise<OpenShellMxcRunResult>;
};

export type OpenShellMxcNetworkAllowRule = {
  host: string;
  reason: string;
  port?: number;
  protocol?: "rest" | "websocket" | "graphql" | "mcp" | "json-rpc";
  access?: "read-only" | "read-write" | "full";
  methods?: readonly string[];
  paths?: readonly string[];
};

type OpenShellMxcPolicyNetworkRule = {
  allow: {
    method: string;
    path: string;
  };
};

type OpenShellMxcPolicyEndpoint = {
  host: string;
  port: number;
  protocol: "rest" | "websocket" | "graphql" | "mcp" | "json-rpc";
  enforcement: "enforce";
  path?: string;
  access?: "read-only" | "read-write" | "full";
  rules?: OpenShellMxcPolicyNetworkRule[];
};

type OpenShellMxcPolicyBinary = {
  path: string;
};

type OpenShellMxcPolicyNetworkEntry = {
  name: string;
  endpoints: OpenShellMxcPolicyEndpoint[];
  binaries: OpenShellMxcPolicyBinary[];
};

export type OpenShellMxcProcessAllowRule = {
  executable: "pnpm" | "node";
  args?: readonly string[];
  reason: string;
};

export type OpenShellMxcCredentialEnvRef = {
  name: string;
  required: boolean;
  secret: boolean;
};

export type OpenShellMxcPolicy = {
  version: 1;
  filesystem_policy: {
    include_workdir: false;
    read_only: string[];
    read_write: string[];
  };
  landlock: {
    compatibility: "hard_requirement";
  };
  process: {
    run_as_user: "sandbox";
    run_as_group: "sandbox";
  };
  network_policies: Record<string, OpenShellMxcPolicyNetworkEntry>;
};

export type GeneratedMcpProjectContext = {
  rootDir: string;
  family: GeneratedMcpFamily;
  provider: string;
  generatedProjectDir?: string;
};

export type BuildOpenShellMxcPolicyOptions = GeneratedMcpProjectContext & {
  manifest?: McpManifest;
  manifestPath?: string;
  sourceInputPaths?: readonly string[];
  writablePaths?: readonly string[];
  networkAllowlist?: readonly OpenShellMxcNetworkAllowRule[];
  credentialEnvRefs?: readonly string[];
  processAllowlist?: readonly OpenShellMxcProcessAllowRule[];
};

export type RunGeneratedProjectInOpenShellMxcOptions = BuildOpenShellMxcPolicyOptions & {
  phase: GeneratedMcpLifecyclePhase;
  command?: OpenShellMxcCommand;
  runtime?: OpenShellMxcRuntime;
};

export type RunGeneratedProjectBuildAndTestOptions = Omit<
  RunGeneratedProjectInOpenShellMxcOptions,
  "phase" | "command"
> & {
  buildCommand?: OpenShellMxcCommand;
  testCommand?: OpenShellMxcCommand;
};

type NormalizedGeneratedProjectContext = Required<GeneratedMcpProjectContext>;

const DEFAULT_PROCESS_ALLOWLIST: readonly OpenShellMxcProcessAllowRule[] = [
  { executable: "pnpm", args: ["run", "build"], reason: "generated project build script" },
  { executable: "pnpm", args: ["run", "test"], reason: "generated project test script" },
  { executable: "node", reason: "node runtime used by package scripts inside OpenShell" },
];

const DEFAULT_COMMANDS: Record<GeneratedMcpLifecyclePhase, OpenShellMxcCommand> = {
  build: { executable: "pnpm", args: ["run", "build"] },
  test: { executable: "pnpm", args: ["run", "test"] },
};

const OPENSHELL_BINARY_PATHS: Record<OpenShellMxcCommand["executable"], readonly string[]> = {
  node: ["/usr/bin/node", "/usr/local/bin/node"],
  pnpm: ["/usr/bin/pnpm", "/usr/local/bin/pnpm"],
};

export class OpenShellMxcUnavailableError extends Error {
  readonly code = "OPENSHELL_MXC_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "OpenShellMxcUnavailableError";
  }
}

export class OpenShellMxcPolicyError extends Error {
  readonly code = "OPENSHELL_MXC_POLICY_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "OpenShellMxcPolicyError";
  }
}

export function unavailableOpenShellMxcRuntime(
  reason = "No OpenShell-backed MXC runtime adapter was provided.",
): OpenShellMxcRuntime {
  return {
    kind: "openshell-mxc",
    async checkAvailability() {
      return { ok: false, reason };
    },
    async run() {
      throw new OpenShellMxcUnavailableError(reason);
    },
  };
}

export function generatedMcpProjectDir(context: GeneratedMcpProjectContext): string {
  return join(
    resolve(context.rootDir),
    GENERATED_MCP_CODEGEN_ROOT,
    context.family,
    context.provider,
  );
}

export function buildOpenShellMxcPolicy(
  options: BuildOpenShellMxcPolicyOptions,
): OpenShellMxcPolicy {
  const context = normalizeGeneratedProjectContext(options);
  const manifestPath = options.manifestPath
    ? assertInsideRoot(context.rootDir, options.manifestPath, "manifestPath")
    : undefined;
  const readOnlyPaths = uniqueSorted([
    join(context.rootDir, "package.json"),
    join(context.rootDir, "pnpm-lock.yaml"),
    join(context.rootDir, "pnpm-workspace.yaml"),
    join(context.rootDir, "packages"),
    join(context.rootDir, "registry"),
    ...(manifestPath ? [manifestPath] : []),
    ...(options.sourceInputPaths ?? []).map((path) =>
      assertInsideRoot(context.rootDir, path, "sourceInputPaths"),
    ),
  ]);
  const readWritePaths = uniqueSorted([
    context.generatedProjectDir,
    ...(options.writablePaths ?? []).map((path) =>
      assertInsideRoot(context.generatedProjectDir, path, "writablePaths"),
    ),
  ]);
  const processAllow = normalizeProcessAllowlist([
    ...DEFAULT_PROCESS_ALLOWLIST,
    ...(options.processAllowlist ?? []),
  ]);

  return {
    version: 1,
    filesystem_policy: {
      include_workdir: false,
      read_only: readOnlyPaths,
      read_write: readWritePaths,
    },
    landlock: {
      compatibility: "hard_requirement",
    },
    process: {
      run_as_user: "sandbox",
      run_as_group: "sandbox",
    },
    network_policies: buildNetworkPolicies({
      family: context.family,
      provider: context.provider,
      allowlist: options.networkAllowlist ?? [],
      processAllow,
    }),
  };
}

export function stringifyOpenShellMxcPolicy(policy: OpenShellMxcPolicy): string {
  return stringify(policy, { sortMapEntries: true });
}

export async function writeOpenShellMxcPolicyFile(
  options: BuildOpenShellMxcPolicyOptions,
): Promise<{ path: string; policy: OpenShellMxcPolicy; yaml: string }> {
  const context = normalizeGeneratedProjectContext(options);
  const policy = buildOpenShellMxcPolicy({
    ...options,
    generatedProjectDir: context.generatedProjectDir,
  });
  const yaml = stringifyOpenShellMxcPolicy(policy);
  const path = join(context.generatedProjectDir, OPENSHELL_MXC_POLICY_FILE);
  await mkdir(context.generatedProjectDir, { recursive: true });
  await writeFile(path, yaml);
  return { path, policy, yaml };
}

export async function runGeneratedProjectInOpenShellMxc(
  options: RunGeneratedProjectInOpenShellMxcOptions,
): Promise<OpenShellMxcRunResult> {
  const runtime = options.runtime ?? unavailableOpenShellMxcRuntime();
  if (runtime.kind !== "openshell-mxc") {
    throw new OpenShellMxcUnavailableError(
      "Generated MCP build/test requires an OpenShell-backed MXC runtime adapter.",
    );
  }

  const availability = await runtime.checkAvailability();
  if (!availability.ok) {
    throw new OpenShellMxcUnavailableError(
      `Generated MCP build/test requires OpenShell-backed MXC isolation: ${availability.reason}`,
    );
  }

  const context = normalizeGeneratedProjectContext(options);
  const policy = buildOpenShellMxcPolicy({
    ...options,
    generatedProjectDir: context.generatedProjectDir,
  });
  const command = options.command ?? DEFAULT_COMMANDS[options.phase];

  return runtime.run({
    runtime: { mxc: "required", openshell: "required" },
    family: context.family,
    provider: context.provider,
    phase: options.phase,
    projectDir: context.generatedProjectDir,
    command,
    policy,
    policyYaml: stringifyOpenShellMxcPolicy(policy),
    env: {
      inherit: false,
      refs: credentialRefsForPolicy(
        uniqueSorted([
          ...credentialEnvRefsFromManifest(options.manifest),
          ...(options.credentialEnvRefs ?? []),
        ]),
      ),
    },
    directHostExecution: "forbidden",
  });
}

export async function runGeneratedProjectBuildAndTestInOpenShellMxc(
  options: RunGeneratedProjectBuildAndTestOptions,
): Promise<{ build: OpenShellMxcRunResult; test: OpenShellMxcRunResult }> {
  const build = await runGeneratedProjectInOpenShellMxc({
    ...options,
    phase: "build",
    ...(options.buildCommand ? { command: options.buildCommand } : {}),
  });
  const test = await runGeneratedProjectInOpenShellMxc({
    ...options,
    phase: "test",
    ...(options.testCommand ? { command: options.testCommand } : {}),
  });
  return { build, test };
}

export function credentialEnvRefsFromManifest(manifest: McpManifest | undefined): string[] {
  if (!manifest) return [];

  const refs: string[] = [];
  for (const auth of manifest.spec.auth) {
    switch (auth.type) {
      case "bearer":
      case "api-key":
        refs.push(auth.valueFrom.env);
        break;
      case "basic":
        refs.push(auth.usernameFrom.env, auth.passwordFrom.env);
        break;
      case "oauth2":
        if (auth.valueFrom) refs.push(auth.valueFrom.env);
        if (auth.clientIdFrom) refs.push(auth.clientIdFrom.env);
        if (auth.clientSecretFrom) refs.push(auth.clientSecretFrom.env);
        break;
    }
  }

  const deploymentAuth = manifest.deployment.auth;
  if (deploymentAuth?.type === "bearer" && deploymentAuth.tokenFrom) {
    refs.push(deploymentAuth.tokenFrom.env);
  }
  if (deploymentAuth?.type === "oauth2-resource" && deploymentAuth.tokenFrom) {
    refs.push(deploymentAuth.tokenFrom.env);
  }

  return uniqueSorted(refs);
}

function normalizeGeneratedProjectContext(
  context: GeneratedMcpProjectContext,
): NormalizedGeneratedProjectContext {
  if (!generatedMcpFamilies.includes(context.family)) {
    throw new OpenShellMxcPolicyError(`Unsupported generated MCP family: ${context.family}`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(context.provider)) {
    throw new OpenShellMxcPolicyError(
      `Generated MCP provider must be a lowercase slug, got "${context.provider}".`,
    );
  }

  const rootDir = resolve(context.rootDir);
  const expectedProjectDir = generatedMcpProjectDir({ ...context, rootDir });
  const generatedProjectDir = context.generatedProjectDir
    ? assertInsideRoot(expectedProjectDir, context.generatedProjectDir, "generatedProjectDir")
    : expectedProjectDir;

  return {
    rootDir,
    family: context.family,
    provider: context.provider,
    generatedProjectDir,
  };
}

function assertInsideRoot(rootDir: string, value: string, label: string): string {
  const root = resolve(rootDir);
  const target = resolve(value);
  const child = relative(root, target);
  if (child === "" || (!child.startsWith("..") && !child.includes(`..${sep}`))) return target;
  throw new OpenShellMxcPolicyError(`${label} escapes required root: ${value}`);
}

function buildNetworkPolicies(options: {
  family: GeneratedMcpFamily;
  provider: string;
  allowlist: readonly OpenShellMxcNetworkAllowRule[];
  processAllow: readonly OpenShellMxcProcessAllowRule[];
}): Record<string, OpenShellMxcPolicyNetworkEntry> {
  if (options.allowlist.length === 0) return {};

  return {
    generated_mcp_allowlist: {
      name: `mcp-codegen-${options.family}-${options.provider}`,
      endpoints: options.allowlist.map(normalizeNetworkRule),
      binaries: binaryPathsForProcessAllowlist(options.processAllow).map((path) => ({ path })),
    },
  };
}

function normalizeNetworkRule(rule: OpenShellMxcNetworkAllowRule): OpenShellMxcPolicyEndpoint {
  if (!rule.host.trim()) throw new OpenShellMxcPolicyError("Network allow rules require host.");
  if (!rule.reason.trim()) throw new OpenShellMxcPolicyError("Network allow rules require reason.");
  const port = rule.port ?? 443;
  if (!Number.isInteger(port) || port <= 0) {
    throw new OpenShellMxcPolicyError(`Invalid network allow port for ${rule.host}.`);
  }
  if (rule.access && (rule.methods || rule.paths)) {
    throw new OpenShellMxcPolicyError("Network allow rules cannot combine access with methods/paths.");
  }

  const protocol = rule.protocol ?? "rest";
  const methods = rule.methods ? uniqueSorted(rule.methods.map((method) => method.toUpperCase())) : [];
  const paths = rule.paths ? uniqueSorted(rule.paths) : [];
  const rules =
    methods.length > 0 || paths.length > 0
      ? methods.flatMap((method) =>
          (paths.length > 0 ? paths : ["/**"]).map((path) => ({ allow: { method, path } })),
        )
      : undefined;

  return {
    host: rule.host,
    port,
    protocol,
    enforcement: "enforce",
    ...(rule.access ? { access: rule.access } : {}),
    ...(rules ? { rules } : {}),
  };
}

function normalizeProcessAllowlist(
  rules: readonly OpenShellMxcProcessAllowRule[],
): OpenShellMxcProcessAllowRule[] {
  const byKey = new Map<string, OpenShellMxcProcessAllowRule>();
  for (const rule of rules) {
    const args = rule.args ? [...rule.args] : undefined;
    const key = `${rule.executable}\0${args?.join("\0") ?? "*"}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      executable: rule.executable,
      reason: rule.reason,
      ...(args ? { args } : {}),
    });
  }
  return [...byKey.values()].sort((left, right) => {
    const leftKey = `${left.executable} ${left.args?.join(" ") ?? "*"}`;
    const rightKey = `${right.executable} ${right.args?.join(" ") ?? "*"}`;
    return leftKey.localeCompare(rightKey);
  });
}

function binaryPathsForProcessAllowlist(
  rules: readonly OpenShellMxcProcessAllowRule[],
): string[] {
  return uniqueSorted(rules.flatMap((rule) => OPENSHELL_BINARY_PATHS[rule.executable]));
}

function credentialRefsForPolicy(refs: readonly string[]): OpenShellMxcCredentialEnvRef[] {
  return refs.map((name) => {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      throw new OpenShellMxcPolicyError(`Invalid credential env ref: ${name}`);
    }
    return { name, required: true, secret: true };
  });
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
