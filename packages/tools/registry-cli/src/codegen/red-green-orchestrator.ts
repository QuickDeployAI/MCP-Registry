import { resolve } from "node:path";
import type {
  OpenShellMxcCommand,
  OpenShellMxcNetworkAllowRule,
  OpenShellMxcProcessAllowRule,
  OpenShellMxcRunResult,
  OpenShellMxcRuntime,
} from "./openshell-mxc";
import {
  runGeneratedProjectInOpenShellMxc,
  writeOpenShellMxcPolicyFile,
} from "./openshell-mxc";
import {
  writeGeneratedMcpManifest,
  type GeneratedMcpManifestIntent,
  type WriteGeneratedMcpManifestResult,
} from "./manifest-generator";
import {
  writeGeneratedMcpCodegenProject,
  type GeneratedMcpSourceFixture,
  type WriteGeneratedMcpCodegenProjectResult,
} from "./project-generator";
import {
  writeGeneratedMcpTestFile,
  type WriteGeneratedMcpTestFileResult,
} from "./test-generator";

export type RunGeneratedMcpRedGreenFlowOptions = {
  readonly rootDir: string;
  readonly intent: GeneratedMcpManifestIntent;
  readonly runtime?: OpenShellMxcRuntime;
  readonly cleanGeneratedProject?: boolean;
  readonly sourceFixtures?: readonly GeneratedMcpSourceFixture[];
  readonly sourceInputPaths?: readonly string[];
  readonly networkAllowlist?: readonly OpenShellMxcNetworkAllowRule[];
  readonly credentialEnvRefs?: readonly string[];
  readonly processAllowlist?: readonly OpenShellMxcProcessAllowRule[];
  readonly buildCommand?: OpenShellMxcCommand;
  readonly testCommand?: OpenShellMxcCommand;
};

export type RunGeneratedMcpRedGreenCodegenOptions = RunGeneratedMcpRedGreenFlowOptions;

export type GeneratedMcpRedGreenStepName =
  | "manifest"
  | "generated-test"
  | "codegen-project"
  | "openshell-policy"
  | "sandbox-build"
  | "sandbox-test";

export type GeneratedMcpRedGreenStep = {
  readonly name: GeneratedMcpRedGreenStepName;
  readonly path?: string;
};

export type GeneratedMcpRedGreenArtifacts = {
  readonly manifest: WriteGeneratedMcpManifestResult;
  readonly generatedTest: WriteGeneratedMcpTestFileResult;
  readonly codegenProject: WriteGeneratedMcpCodegenProjectResult;
  readonly openshellPolicy: Awaited<ReturnType<typeof writeOpenShellMxcPolicyFile>>;
};

export type RunGeneratedMcpRedGreenCodegenResult = GeneratedMcpRedGreenArtifacts & {
  readonly steps: readonly GeneratedMcpRedGreenStep[];
  readonly build: OpenShellMxcRunResult;
  readonly test: OpenShellMxcRunResult;
  readonly project: WriteGeneratedMcpCodegenProjectResult;
  readonly policy: Awaited<ReturnType<typeof writeOpenShellMxcPolicyFile>>;
  readonly sandbox: {
    readonly build: OpenShellMxcRunResult;
    readonly test: OpenShellMxcRunResult;
  };
};

export class GeneratedMcpRedGreenRunError extends Error {
  readonly phase: "build" | "test";
  readonly result: OpenShellMxcRunResult;
  readonly artifacts: GeneratedMcpRedGreenArtifacts;

  constructor(
    phase: "build" | "test",
    result: OpenShellMxcRunResult,
    artifacts: GeneratedMcpRedGreenArtifacts,
  ) {
    super(`Generated MCP ${phase} failed in OpenShell/MXC with exit code ${result.exitCode}.`);
    this.name = "GeneratedMcpRedGreenRunError";
    this.phase = phase;
    this.result = result;
    this.artifacts = artifacts;
  }
}

export async function runGeneratedMcpRedGreenCodegen(
  options: RunGeneratedMcpRedGreenCodegenOptions,
): Promise<RunGeneratedMcpRedGreenCodegenResult> {
  const rootDir = resolve(options.rootDir);
  const manifest = await writeGeneratedMcpManifest({
    rootDir,
    intent: options.intent,
  });
  const generatedTest = await writeGeneratedMcpTestFile({
    rootDir,
    intent: options.intent,
  });
  if (generatedTest.manifestPath !== manifest.manifestPath) {
    throw new Error(
      `Generated test manifest path ${generatedTest.manifestPath} did not match ${manifest.manifestPath}.`,
    );
  }

  const codegenProject = await writeGeneratedMcpCodegenProject({
    rootDir,
    manifest: manifest.manifest,
    manifestPath: manifest.manifestPath,
    provider: manifest.provider,
    family: manifest.family,
    capability: manifest.capability,
    generatedTestPath: generatedTest.path,
    sourceFixtures: options.sourceFixtures,
    clean: options.cleanGeneratedProject,
  });

  const manifestAbsolutePath = resolve(rootDir, manifest.manifestPath);
  const openshellPolicy = await writeOpenShellMxcPolicyFile({
    rootDir,
    family: manifest.family,
    provider: manifest.provider,
    generatedProjectDir: codegenProject.absoluteProjectPath,
    manifest: manifest.manifest,
    manifestPath: manifestAbsolutePath,
    sourceInputPaths: options.sourceInputPaths,
    networkAllowlist: options.networkAllowlist,
    credentialEnvRefs: options.credentialEnvRefs,
    processAllowlist: options.processAllowlist,
  });
  const artifacts: GeneratedMcpRedGreenArtifacts = {
    manifest,
    generatedTest,
    codegenProject,
    openshellPolicy,
  };

  const commonRunOptions = {
    rootDir,
    family: manifest.family,
    provider: manifest.provider,
    generatedProjectDir: codegenProject.absoluteProjectPath,
    manifest: manifest.manifest,
    manifestPath: manifestAbsolutePath,
    sourceInputPaths: options.sourceInputPaths,
    networkAllowlist: options.networkAllowlist,
    credentialEnvRefs: options.credentialEnvRefs,
    processAllowlist: options.processAllowlist,
    runtime: options.runtime,
  };
  const build = await runGeneratedProjectInOpenShellMxc({
    ...commonRunOptions,
    phase: "build",
    ...(options.buildCommand ? { command: options.buildCommand } : {}),
  });
  assertSuccessfulSandboxPhase("build", build, artifacts);
  const test = await runGeneratedProjectInOpenShellMxc({
    ...commonRunOptions,
    phase: "test",
    ...(options.testCommand ? { command: options.testCommand } : {}),
  });
  assertSuccessfulSandboxPhase("test", test, artifacts);

  return {
    steps: [
      { name: "manifest", path: manifest.path },
      { name: "generated-test", path: generatedTest.absolutePath },
      { name: "codegen-project", path: codegenProject.absoluteProjectPath },
      { name: "openshell-policy", path: openshellPolicy.path },
      { name: "sandbox-build" },
      { name: "sandbox-test" },
    ],
    manifest,
    generatedTest,
    codegenProject,
    openshellPolicy,
    build,
    test,
    project: codegenProject,
    policy: openshellPolicy,
    sandbox: { build, test },
  };
}

export async function runGeneratedMcpRedGreenFlow(
  options: RunGeneratedMcpRedGreenFlowOptions,
): Promise<RunGeneratedMcpRedGreenCodegenResult> {
  return runGeneratedMcpRedGreenCodegen(options);
}

function assertSuccessfulSandboxPhase(
  phase: "build" | "test",
  result: OpenShellMxcRunResult,
  artifacts: GeneratedMcpRedGreenArtifacts,
): void {
  if (result.exitCode !== 0) throw new GeneratedMcpRedGreenRunError(phase, result, artifacts);
}
