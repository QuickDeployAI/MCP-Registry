import { writeGeneratedMcpManifest, type GeneratedMcpManifestIntent } from "./manifest-generator";
import {
  runGeneratedProjectBuildAndTestInOpenShellMxc,
  type OpenShellMxcNetworkAllowRule,
  type OpenShellMxcRunResult,
  type OpenShellMxcRuntime,
} from "./openshell-mxc";
import {
  writeGeneratedMcpCodegenProject,
  type GeneratedMcpSourceFixture,
  type WriteGeneratedMcpCodegenProjectResult,
} from "./project-generator";
import {
  writeGeneratedMcpTestFile,
  type WriteGeneratedMcpTestFileResult,
} from "./test-generator";

export type GeneratedMcpCodegenFlowIntent = GeneratedMcpManifestIntent & {
  readonly sourceFixtures?: readonly GeneratedMcpSourceFixture[];
};

export type RunGeneratedMcpCodegenFlowOptions = {
  readonly rootDir: string;
  readonly intent: GeneratedMcpCodegenFlowIntent;
  readonly clean?: boolean;
  readonly runtime?: OpenShellMxcRuntime;
  readonly networkAllowlist?: readonly OpenShellMxcNetworkAllowRule[];
  readonly credentialEnvRefs?: readonly string[];
  readonly sourceInputPaths?: readonly string[];
};

export type GeneratedMcpCodegenFlowResult = {
  readonly manifest: Awaited<ReturnType<typeof writeGeneratedMcpManifest>>;
  readonly generatedTest: WriteGeneratedMcpTestFileResult;
  readonly project: WriteGeneratedMcpCodegenProjectResult;
  readonly sandbox: {
    readonly build: OpenShellMxcRunResult;
    readonly test: OpenShellMxcRunResult;
  };
};

export class GeneratedMcpCodegenFlowRunError extends Error {
  readonly phase: "build" | "test";
  readonly result: OpenShellMxcRunResult;

  constructor(phase: "build" | "test", result: OpenShellMxcRunResult) {
    super(`Generated MCP ${phase} failed in OpenShell/MXC with exit code ${result.exitCode}.`);
    this.name = "GeneratedMcpCodegenFlowRunError";
    this.phase = phase;
    this.result = result;
  }
}

export async function runGeneratedMcpCodegenFlow(
  options: RunGeneratedMcpCodegenFlowOptions,
): Promise<GeneratedMcpCodegenFlowResult> {
  const manifest = await writeGeneratedMcpManifest({
    rootDir: options.rootDir,
    intent: options.intent,
  });
  const generatedTest = await writeGeneratedMcpTestFile({
    rootDir: options.rootDir,
    intent: options.intent,
  });
  const project = await writeGeneratedMcpCodegenProject({
    rootDir: options.rootDir,
    manifest: manifest.manifest,
    manifestPath: manifest.manifestPath,
    provider: manifest.provider,
    family: manifest.family,
    capability: manifest.capability,
    generatedTestPath: generatedTest.path,
    sourceFixtures: options.intent.sourceFixtures,
    clean: options.clean,
  });

  const sandbox = await runGeneratedProjectBuildAndTestInOpenShellMxc({
    rootDir: options.rootDir,
    family: manifest.family,
    provider: manifest.provider,
    generatedProjectDir: project.absoluteProjectPath,
    manifest: manifest.manifest,
    manifestPath: manifest.path,
    sourceInputPaths: options.sourceInputPaths,
    networkAllowlist: options.networkAllowlist,
    credentialEnvRefs: options.credentialEnvRefs,
    runtime: options.runtime,
  });

  assertSandboxPhase("build", sandbox.build);
  assertSandboxPhase("test", sandbox.test);

  return { manifest, generatedTest, project, sandbox };
}

function assertSandboxPhase(phase: "build" | "test", result: OpenShellMxcRunResult): void {
  if (result.exitCode !== 0) throw new GeneratedMcpCodegenFlowRunError(phase, result);
}
