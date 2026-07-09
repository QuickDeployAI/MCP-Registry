import { isAbsolute, relative, resolve } from "node:path";
import {
  GENERATED_MCP_CODEGEN_ROOT,
  type GeneratedMcpWorkspacePaths,
} from "./workspace-conventions";

export const GENERATED_MCP_SANDBOX_RUNTIME = {
  isolation: "mxc",
  runtime: "nvidia-openshell",
  runnerPackage: "@microsoft/mxc",
} as const;

export type GeneratedMcpSandboxPhase = "build" | "test";

export type GeneratedMcpSandboxCommand = {
  readonly packageManager: "pnpm";
  readonly script: GeneratedMcpSandboxPhase;
};

export type GeneratedMcpFilesystemPolicy = {
  readonly readOnly: readonly string[];
  readonly writable: readonly string[];
  readonly ambientHostAccess: "deny";
};

export type GeneratedMcpNetworkPolicy = {
  readonly default: "deny";
  readonly allowlist: readonly string[];
};

export type GeneratedMcpProcessPolicy = {
  readonly hostExecution: "deny";
  readonly childProcesses: "deny-outside-mxc-openshell";
};

export type GeneratedMcpEnvironmentPolicy = {
  readonly secretSource: "env-ref-only";
  readonly allowedEnv: readonly string[];
};

export type GeneratedMcpSandboxPolicy = {
  readonly filesystem: GeneratedMcpFilesystemPolicy;
  readonly network: GeneratedMcpNetworkPolicy;
  readonly process: GeneratedMcpProcessPolicy;
  readonly environment: GeneratedMcpEnvironmentPolicy;
};

export type GeneratedMcpSandboxExecutionRequest = {
  readonly phase: GeneratedMcpSandboxPhase;
  readonly runtime: typeof GENERATED_MCP_SANDBOX_RUNTIME;
  readonly command: GeneratedMcpSandboxCommand;
  readonly projectPath: string;
  readonly manifestPath: string;
  readonly generatedTestPath: string;
  readonly policy: GeneratedMcpSandboxPolicy;
};

export type GeneratedMcpSandboxExecutionResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type GeneratedMcpMxcOpenShellProbe = {
  readonly mxcAvailable: boolean;
  readonly openShellAvailable: boolean;
  readonly supported: boolean;
  readonly reason?: string;
};

export type GeneratedMcpMxcOpenShellRunner = {
  readonly probe: () =>
    | GeneratedMcpMxcOpenShellProbe
    | Promise<GeneratedMcpMxcOpenShellProbe>;
  readonly run: (
    request: GeneratedMcpSandboxExecutionRequest,
  ) => GeneratedMcpSandboxExecutionResult | Promise<GeneratedMcpSandboxExecutionResult>;
};

export type GeneratedMcpSandboxHarnessOptions = {
  readonly rootDir?: string;
  readonly runner?: GeneratedMcpMxcOpenShellRunner;
};

export type GeneratedMcpSandboxRunOptions = {
  readonly paths: GeneratedMcpWorkspacePaths;
  readonly env?: readonly string[];
  readonly networkAllowlist?: readonly string[];
};

export type GeneratedMcpSandboxHarness = {
  readonly build: (
    options: GeneratedMcpSandboxRunOptions,
  ) => Promise<GeneratedMcpSandboxExecutionResult>;
  readonly test: (
    options: GeneratedMcpSandboxRunOptions,
  ) => Promise<GeneratedMcpSandboxExecutionResult>;
};

export class GeneratedMcpSandboxUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeneratedMcpSandboxUnavailableError";
  }
}

export class GeneratedMcpSandboxRunError extends Error {
  readonly request: GeneratedMcpSandboxExecutionRequest;
  readonly result: GeneratedMcpSandboxExecutionResult;

  constructor(
    request: GeneratedMcpSandboxExecutionRequest,
    result: GeneratedMcpSandboxExecutionResult,
  ) {
    super(`Generated MCP ${request.phase} failed in MXC OpenShell with exit code ${result.exitCode}.`);
    this.name = "GeneratedMcpSandboxRunError";
    this.request = request;
    this.result = result;
  }
}

export function createGeneratedMcpSandboxHarness(
  options: GeneratedMcpSandboxHarnessOptions = {},
): GeneratedMcpSandboxHarness {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const runner = options.runner;

  return {
    build: (runOptions) => runGeneratedMcpPhase("build", rootDir, runner, runOptions),
    test: (runOptions) => runGeneratedMcpPhase("test", rootDir, runner, runOptions),
  };
}

export function buildGeneratedMcpSandboxRequest(
  phase: GeneratedMcpSandboxPhase,
  rootDir: string,
  options: GeneratedMcpSandboxRunOptions,
): GeneratedMcpSandboxExecutionRequest {
  const root = resolve(rootDir);
  const codegenRoot = resolve(root, GENERATED_MCP_CODEGEN_ROOT);
  const projectPath = resolve(root, stripTrailingSlash(options.paths.codegenProjectPath));
  assertInside(
    projectPath,
    codegenRoot,
    `Generated MCP codegen project must stay under ${GENERATED_MCP_CODEGEN_ROOT}.`,
  );

  const manifestPath = resolve(root, options.paths.manifestPath);
  const generatedTestPath = resolve(root, options.paths.generatedTestPath);
  assertOutsideGeneratedRoot(manifestPath, codegenRoot, "Manifest");
  assertOutsideGeneratedRoot(generatedTestPath, codegenRoot, "Generated test");

  return {
    phase,
    runtime: GENERATED_MCP_SANDBOX_RUNTIME,
    command: { packageManager: "pnpm", script: phase },
    projectPath,
    manifestPath,
    generatedTestPath,
    policy: {
      filesystem: {
        readOnly: [manifestPath, generatedTestPath],
        writable: [projectPath],
        ambientHostAccess: "deny",
      },
      network: {
        default: "deny",
        allowlist: uniqueSorted(options.networkAllowlist ?? []),
      },
      process: {
        hostExecution: "deny",
        childProcesses: "deny-outside-mxc-openshell",
      },
      environment: {
        secretSource: "env-ref-only",
        allowedEnv: uniqueSorted(options.env ?? []),
      },
    },
  };
}

async function runGeneratedMcpPhase(
  phase: GeneratedMcpSandboxPhase,
  rootDir: string,
  runner: GeneratedMcpMxcOpenShellRunner | undefined,
  options: GeneratedMcpSandboxRunOptions,
): Promise<GeneratedMcpSandboxExecutionResult> {
  const readyRunner = await requireMxcOpenShellReady(runner);
  const request = buildGeneratedMcpSandboxRequest(phase, rootDir, options);
  const result = await readyRunner.run(request);
  if (result.exitCode !== 0) throw new GeneratedMcpSandboxRunError(request, result);
  return result;
}

async function requireMxcOpenShellReady(
  runner: GeneratedMcpMxcOpenShellRunner | undefined,
): Promise<GeneratedMcpMxcOpenShellRunner> {
  if (!runner) {
    throw new GeneratedMcpSandboxUnavailableError(
      "Generated MCP build/test requires an MXC runner backed by NVIDIA OpenShell.",
    );
  }

  const probe = await runner.probe();
  if (!probe.mxcAvailable) {
    throw new GeneratedMcpSandboxUnavailableError(
      formatUnavailable("MXC is unavailable", probe.reason),
    );
  }
  if (!probe.openShellAvailable) {
    throw new GeneratedMcpSandboxUnavailableError(
      formatUnavailable("NVIDIA OpenShell is unavailable", probe.reason),
    );
  }
  if (!probe.supported) {
    throw new GeneratedMcpSandboxUnavailableError(
      formatUnavailable("MXC OpenShell runtime is unsupported", probe.reason),
    );
  }

  return runner;
}

function assertOutsideGeneratedRoot(path: string, codegenRoot: string, label: string): void {
  if (isInside(path, codegenRoot)) {
    throw new Error(`${label} path must be committed source, not ${GENERATED_MCP_CODEGEN_ROOT}.`);
  }
}

function assertInside(path: string, parent: string, message: string): void {
  if (!isInside(path, parent)) throw new Error(message);
}

function isInside(path: string, parent: string): boolean {
  const candidate = resolve(path);
  const root = resolve(parent);
  const child = relative(root, candidate);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function formatUnavailable(message: string, reason: string | undefined): string {
  return reason ? `${message}: ${reason}` : message;
}
