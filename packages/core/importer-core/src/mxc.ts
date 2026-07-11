import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type MxcSandboxResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
};

export type MxcSandboxRequest = {
  readonly commandLine: string;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly input?: string;
  readonly readonlyPaths?: readonly string[];
  readonly readwritePaths?: readonly string[];
  readonly allowOutbound?: boolean;
  readonly timeoutMs?: number;
  readonly outputLimitBytes?: number;
};

export type MxcCommandRunner = {
  run(request: MxcSandboxRequest): Promise<MxcSandboxResult>;
};

type MxcSdkLike = {
  getPlatformSupport?: () => { readonly isSupported?: boolean; readonly reason?: string };
  getAvailableToolsPolicy: (env: NodeJS.ProcessEnv) => {
    readonly readonlyPaths?: readonly string[];
    readonly readwritePaths?: readonly string[];
  };
  getTemporaryFilesPolicy: () => {
    readonly readonlyPaths?: readonly string[];
    readonly readwritePaths?: readonly string[];
  };
  createConfigFromPolicy: (policy: Record<string, unknown>) => MxcConfig;
  spawnSandboxFromConfig: (
    config: MxcConfig,
    options: { readonly usePty: false },
  ) => MxcChildLike;
};

type MxcConfig = Record<string, unknown> & {
  process?: {
    commandLine?: string;
    cwd?: string;
    environment?: Readonly<Record<string, string>>;
  };
};

type MxcChildLike = {
  readonly stdin?: { end(input?: string): void };
  readonly stdout?: {
    setEncoding?(encoding: BufferEncoding): void;
    on(event: "data", listener: (chunk: string | Buffer) => void): unknown;
  };
  readonly stderr?: {
    setEncoding?(encoding: BufferEncoding): void;
    on(event: "data", listener: (chunk: string | Buffer) => void): unknown;
  };
  on(event: "close", listener: (code: number | null) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  kill?(): void;
};

export type CreateMxcSandboxRunnerOptions = {
  readonly sdk?: MxcSdkLike;
  readonly env?: NodeJS.ProcessEnv;
  readonly defaultTimeoutMs?: number;
  readonly defaultOutputLimitBytes?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_OUTPUT_LIMIT_BYTES = 1024 * 1024;

export function createMxcSandboxRunner(
  options: CreateMxcSandboxRunnerOptions = {},
): MxcCommandRunner {
  return {
    async run(request) {
      const sdk = options.sdk ?? (await loadMxcSdk());
      const support = sdk.getPlatformSupport?.();
      if (support && support.isSupported === false) {
        throw new Error(`MXC sandbox is required but unavailable: ${support.reason ?? "unsupported host"}`);
      }

      const env = options.env ?? process.env;
      const tools = sdk.getAvailableToolsPolicy(env);
      const temporary = sdk.getTemporaryFilesPolicy();
      const hostTemp = await mkdtemp(path.join(tmpdir(), "qdai-mxc-"));
      const timeoutMs = request.timeoutMs ?? options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
      const outputLimitBytes =
        request.outputLimitBytes ??
        options.defaultOutputLimitBytes ??
        DEFAULT_OUTPUT_LIMIT_BYTES;

      try {
        const policy = {
          version: "0.6.0-alpha",
          filesystem: {
            readonlyPaths: uniquePaths([
              ...(tools.readonlyPaths ?? []),
              ...(temporary.readonlyPaths ?? []),
              ...(request.readonlyPaths ?? []),
            ]),
            readwritePaths: uniquePaths([
              hostTemp,
              ...(tools.readwritePaths ?? []),
              ...(temporary.readwritePaths ?? []),
              ...(request.readwritePaths ?? []),
            ]),
          },
          network: { allowOutbound: request.allowOutbound ?? false },
          timeoutMs,
        };
        const config = sdk.createConfigFromPolicy(policy);
        config.process ??= {};
        config.process.commandLine = request.commandLine;
        if (request.cwd) config.process.cwd = request.cwd;
        if (request.env) config.process.environment = request.env;

        return await collectSandboxProcess(
          sdk.spawnSandboxFromConfig(config, { usePty: false }),
          {
            ...(request.input === undefined ? {} : { input: request.input }),
            timeoutMs,
            outputLimitBytes,
          },
        );
      } finally {
        await rm(hostTemp, { force: true, recursive: true }).catch(() => undefined);
      }
    },
  };
}

async function loadMxcSdk(): Promise<MxcSdkLike> {
  try {
    return (await import("@microsoft/mxc-sdk")) as unknown as MxcSdkLike;
  } catch (error) {
    throw new Error(
      `MXC sandbox is required but @microsoft/mxc-sdk could not be loaded: ${errorMessage(error)}`,
    );
  }
}

function collectSandboxProcess(
  child: MxcChildLike,
  options: {
    readonly input?: string;
    readonly timeoutMs: number;
    readonly outputLimitBytes: number;
  },
): Promise<MxcSandboxResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill?.();
      fail(new Error(`MXC sandbox timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    child.stdout?.setEncoding?.("utf8");
    child.stderr?.setEncoding?.("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > options.outputLimitBytes) {
        child.kill?.();
        fail(new Error(`MXC sandbox stdout exceeded ${options.outputLimitBytes} bytes`));
      }
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > options.outputLimitBytes) {
        child.kill?.();
        fail(new Error(`MXC sandbox stderr exceeded ${options.outputLimitBytes} bytes`));
      }
    });
    child.on("error", fail);
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode });
    });
    child.stdin?.end(options.input);
  });
}

function uniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths.map((item) => path.resolve(item)))];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
