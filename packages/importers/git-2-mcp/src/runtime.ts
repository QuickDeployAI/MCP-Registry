import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

export type SandboxPolicy = {
  readonly network: "disabled" | "egress-allowlist";
  readonly sourceMount: "readonly";
  readonly writableTmp: boolean;
  readonly timeoutMs: number;
  readonly memoryMb: number;
  readonly processLimit: number;
  readonly outputLimitBytes: number;
  readonly egressAllowlist: readonly string[];
  readonly envAllowlist: readonly string[];
};

export type JsonSchemaProperty = {
  readonly type?: string;
  readonly items?: JsonSchemaProperty;
};

export type PythonFunctionTool = {
  readonly name: string;
  readonly module: string;
  readonly functionName: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: "object";
    readonly properties: Record<string, JsonSchemaProperty>;
    readonly required: readonly string[];
  };
};

export type TypeScriptFunctionTool = {
  readonly name: string;
  readonly entrypoint: string;
  readonly exportName: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: "object";
    readonly properties: Record<string, JsonSchemaProperty>;
    readonly required: readonly string[];
  };
};

export type GitSourcePin = {
  readonly uri: string;
  readonly ref: string;
};

export type DependencyPin = {
  readonly name: string;
  readonly version: string;
  readonly registry?: string;
  readonly hashes: readonly string[];
};

export type DependencyAuditFinding = {
  readonly id: string;
  readonly dependency: string;
  readonly severity: "low" | "moderate" | "high" | "critical";
  readonly summary: string;
};

export type DependencyAuditReport = {
  readonly scanner: string;
  readonly generatedAt: string;
  readonly status: "passed" | "failed";
  readonly dependencyCount: number;
  readonly findings: readonly DependencyAuditFinding[];
};

export type SupplyChainPolicy = {
  readonly source: GitSourcePin;
  readonly allowedIndexes: readonly string[];
  readonly lockfileDigest: string;
  readonly dependencies: readonly DependencyPin[];
  readonly audit: DependencyAuditReport;
};

export type Git2McpManifest = {
  readonly packageName: string;
  readonly runtime: "python";
  readonly sandbox: SandboxPolicy;
  readonly supplyChain: SupplyChainPolicy;
  readonly tools: readonly PythonFunctionTool[];
};

export type TypeScriptGit2McpManifest = {
  readonly packageName: string;
  readonly runtime: "node";
  readonly sandbox: SandboxPolicy;
  readonly supplyChain: SupplyChainPolicy;
  readonly tools: readonly TypeScriptFunctionTool[];
};

export type SandboxRunner = {
  inspect(request: PythonInspectRequest): Promise<readonly PythonFunctionTool[]>;
  call(request: PythonCallRequest): Promise<unknown>;
  runCode(request: PythonRunCodeRequest): Promise<PythonRunCodeResult>;
};

export type TypeScriptRunner = {
  inspect(request: TypeScriptInspectRequest): Promise<readonly TypeScriptFunctionTool[]>;
  call(request: TypeScriptCallRequest): Promise<unknown>;
};

export type PythonInspectRequest = {
  readonly module: string;
  readonly packageRoot: string;
  readonly maxTools: number;
  readonly policy?: Partial<SandboxPolicy>;
};

export type PythonCallRequest = {
  readonly module: string;
  readonly packageRoot: string;
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly policy?: Partial<SandboxPolicy>;
};

export type PythonRunCodeRequest = {
  readonly packageRoot: string;
  readonly code: string;
  readonly policy?: Partial<SandboxPolicy>;
};

export type PythonRunCodeResult = {
  readonly stdout: string;
  readonly result: unknown;
};

export type TypeScriptInspectRequest = {
  readonly packageRoot: string;
  readonly entrypoint?: string;
  readonly maxTools: number;
  readonly policy?: Partial<SandboxPolicy>;
};

export type Git2McpDocsSearchRequest = {
  readonly query: string;
  readonly topK?: number;
};

export type Git2McpDocsSearchResult = {
  readonly title: string;
  readonly source: string;
  readonly text: string;
};

export type Git2McpDocsSearchResponse = {
  readonly query: string;
  readonly results: readonly Git2McpDocsSearchResult[];
};

export type Git2McpContentRef = {
  readonly id: string;
  readonly mime: string;
  readonly charLength: number;
};

export type Git2McpInlineToolResult = {
  readonly kind: "inline";
  readonly value: unknown;
};

export type Git2McpContentRefToolResult = {
  readonly kind: "contentRef";
  readonly id: string;
  readonly text: string;
  readonly contentRef: Git2McpContentRef;
};

export type Git2McpToolResult = Git2McpInlineToolResult | Git2McpContentRefToolResult;

export type Git2McpRuntimeTool =
  | PythonFunctionTool
  | {
      readonly name: "docs_search";
      readonly description: string;
      readonly inputSchema: {
        readonly type: "object";
        readonly properties: {
          readonly query: { readonly type: "string" };
          readonly topK: { readonly type: "integer" };
        };
        readonly required: readonly ["query"];
      };
    }
  | {
      readonly name: "run_code";
      readonly description: string;
      readonly inputSchema: {
        readonly type: "object";
        readonly properties: {
          readonly code: { readonly type: "string" };
        };
        readonly required: readonly ["code"];
      };
    };

export type Git2McpRuntimeSurface = {
  readonly tools: readonly Git2McpRuntimeTool[];
  searchDocs(request: Git2McpDocsSearchRequest): Promise<Git2McpDocsSearchResponse>;
  callTool(request: {
    readonly name: string;
    readonly args?: readonly unknown[];
    readonly code?: string;
  }): Promise<Git2McpToolResult>;
};

export interface Git2McpContentStore {
  write(content: string, metadata: { readonly mime: string }): Promise<Git2McpContentRef>;
  read(id: string): Promise<string>;
}

export type TypeScriptCallRequest = {
  readonly packageRoot: string;
  readonly entrypoint?: string;
  readonly exportName: string;
  readonly args: readonly unknown[];
  readonly policy?: Partial<SandboxPolicy>;
};

const defaultPolicy: SandboxPolicy = {
  network: "disabled",
  sourceMount: "readonly",
  writableTmp: true,
  timeoutMs: 5_000,
  memoryMb: 256,
  processLimit: 1,
  outputLimitBytes: 64 * 1024,
  egressAllowlist: [],
  envAllowlist: ["PATH", "PYTHONIOENCODING", "PYTHONPATH", "SystemRoot"],
};

const defaultSupplyChainPolicy: SupplyChainPolicy = {
  source: {
    uri: "git+https://github.com/QuickDeployAI/git-2-mcp-fixture.git",
    ref: "0123456789abcdef0123456789abcdef01234567",
  },
  allowedIndexes: ["https://pypi.org/simple"],
  lockfileDigest: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  dependencies: [
    {
      name: "qdai-git-fixture",
      version: "0.1.0",
      registry: "https://pypi.org/simple",
      hashes: ["sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"],
    },
  ],
  audit: {
    scanner: "quickdeploy-git2mcp-audit",
    generatedAt: "2026-07-06T00:00:00.000Z",
    status: "passed",
    dependencyCount: 1,
    findings: [],
  },
};

const defaultTypeScriptSupplyChainPolicy: SupplyChainPolicy = {
  ...defaultSupplyChainPolicy,
  source: {
    uri: "git+https://github.com/QuickDeployAI/git-2-mcp-ts-fixture.git",
    ref: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
  },
  dependencies: [
    {
      name: "@quickdeployai/git-2-mcp-ts-fixture",
      version: "0.1.0",
      registry: "https://registry.npmjs.org",
      hashes: ["sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"],
    },
  ],
};

export const GIT2MCP_AUDIT_META_KEY = "ai.quickdeploy.git2mcp/supplyChainAudit" as const;

export function validateSupplyChainPolicy(policy: SupplyChainPolicy): SupplyChainPolicy {
  if (!/^git\+https:\/\/\S+$/.test(policy.source.uri)) {
    throw new Error("git-2-mcp source uri must use git+https");
  }
  if (!isImmutableGitRef(policy.source.ref)) {
    throw new Error("git-2-mcp source ref must be an immutable commit SHA");
  }
  if (policy.allowedIndexes.length === 0) {
    throw new Error("git-2-mcp dependency policy must name at least one allowed index");
  }
  if (!/^sha256:[a-f0-9]{64}$/i.test(policy.lockfileDigest)) {
    throw new Error("git-2-mcp dependency lockfile digest must be sha256 pinned");
  }

  for (const dependency of policy.dependencies) {
    if (!isExactVersion(dependency.version)) {
      throw new Error(`dependency ${dependency.name} must use an exact pinned version`);
    }
    if (dependency.hashes.length === 0) {
      throw new Error(`dependency ${dependency.name} must include at least one hash pin`);
    }
    for (const hash of dependency.hashes) {
      if (!/^sha256:[a-f0-9]{64}$/i.test(hash)) {
        throw new Error(`dependency ${dependency.name} must use sha256 hash pins`);
      }
    }
  }

  if (policy.audit.status !== "passed") {
    throw new Error("git-2-mcp dependency audit must pass before publication");
  }
  if (policy.audit.dependencyCount !== policy.dependencies.length) {
    throw new Error("git-2-mcp dependency audit must cover every pinned dependency");
  }
  if (
    policy.audit.findings.some(
      (finding) => finding.severity === "high" || finding.severity === "critical",
    )
  ) {
    throw new Error("git-2-mcp dependency audit contains unresolved high or critical findings");
  }

  return policy;
}

export function attachSupplyChainAuditMeta<T extends { readonly _meta?: Record<string, unknown> }>(
  serverJson: T,
  audit: DependencyAuditReport,
): T & { readonly _meta: Record<string, unknown> } {
  return {
    ...serverJson,
    _meta: {
      ...serverJson._meta,
      [GIT2MCP_AUDIT_META_KEY]: audit,
    },
  };
}

function isImmutableGitRef(ref: string): boolean {
  return /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(ref);
}

function isExactVersion(version: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
}

const pythonBridge = String.raw`
import importlib
import inspect
import contextlib
import io
import json
import os
import pathlib
import re
import socket
import subprocess
import sys
import tempfile
import builtins
import types
import typing

request = json.loads(sys.stdin.read())
policy = request["policy"]
package_root = os.path.abspath(request["packageRoot"])
source_root = os.path.abspath(os.path.join(package_root, "src"))
sandbox_root = os.path.abspath(request["sandboxRoot"])
runtime_roots = tuple(
    os.path.abspath(root)
    for root in {sys.base_prefix, sys.exec_prefix, os.path.dirname(os.__file__)}
    if root
)

def under(child, parent):
    try:
        return os.path.commonpath([os.path.abspath(child), parent]) == parent
    except ValueError:
        return False

def write_mode(mode):
    return any(flag in mode for flag in ("w", "a", "x", "+"))

original_open = builtins.open
original_os_open = os.open
original_listdir = os.listdir
original_scandir = os.scandir

def guard_path(file, mode="r"):
    candidate = os.path.abspath(os.fspath(file))
    writing = write_mode(mode)
    if under(candidate, source_root) and writing and policy["sourceMount"] == "readonly":
        raise PermissionError(f"sandbox denied source write: {candidate}")
    if under(candidate, package_root):
        return
    if under(candidate, sandbox_root):
        if writing and not policy["writableTmp"]:
            raise PermissionError(f"sandbox denied writable temp access: {candidate}")
        return
    if not writing and any(under(candidate, root) for root in runtime_roots):
        return
    raise PermissionError(f"sandbox denied host filesystem access: {candidate}")

def guarded_open(file, mode="r", *args, **kwargs):
    guard_path(file, mode)
    return original_open(file, mode, *args, **kwargs)

def guarded_os_open(file, flags, mode=0o777, *, dir_fd=None):
    file_mode = "w" if flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_TRUNC) else "r"
    guard_path(file, file_mode)
    return original_os_open(file, flags, mode, dir_fd=dir_fd)

def guarded_listdir(file="."):
    guard_path(file, "r")
    return original_listdir(file)

def guarded_scandir(file="."):
    guard_path(file, "r")
    return original_scandir(file)

builtins.open = guarded_open
pathlib.Path.open = lambda self, mode="r", *args, **kwargs: guarded_open(self, mode, *args, **kwargs)
os.open = guarded_os_open
os.listdir = guarded_listdir
os.scandir = guarded_scandir

original_socket_connect = socket.socket.connect
original_socket_connect_ex = socket.socket.connect_ex
original_create_connection = socket.create_connection

def address_host_port(address):
    if isinstance(address, tuple) and len(address) >= 2:
        return str(address[0]), int(address[1])
    return str(address), None

def egress_allowed(host, port):
    if policy["network"] == "disabled":
        return False
    allowed = set(policy.get("egressAllowlist") or [])
    return host in allowed or (port is not None and f"{host}:{port}" in allowed)

def guard_egress(address):
    host, port = address_host_port(address)
    if not egress_allowed(host, port):
        target = f"{host}:{port}" if port is not None else host
        raise PermissionError(f"sandbox denied network egress: {target}")

def guarded_connect(self, address):
    guard_egress(address)
    return original_socket_connect(self, address)

def guarded_connect_ex(self, address):
    guard_egress(address)
    return original_socket_connect_ex(self, address)

def guarded_create_connection(address, timeout=None, source_address=None, *args, **kwargs):
    guard_egress(address)
    return original_create_connection(address, timeout, source_address, *args, **kwargs)

socket.socket.connect = guarded_connect
socket.socket.connect_ex = guarded_connect_ex
socket.create_connection = guarded_create_connection

def denied_process(*_args, **_kwargs):
    raise PermissionError("sandbox denied child process creation")

subprocess.Popen = denied_process
os.system = denied_process
for name in ("fork", "forkpty", "posix_spawn", "posix_spawnp", "spawnl", "spawnle", "spawnlp", "spawnlpe", "spawnv", "spawnve", "spawnvp", "spawnvpe"):
    if hasattr(os, name):
        setattr(os, name, denied_process)

sys.path.insert(0, source_root)
module = importlib.import_module(request["module"]) if request["op"] in ("inspect", "call") else None

def public_names(container):
    explicit = getattr(container, "__all__", None)
    names = explicit if explicit else dir(container)
    return [name for name in names if not name.startswith("_")]

def schema_type(annotation):
    if annotation is inspect._empty:
        return {}
    if isinstance(annotation, str):
        text = annotation.replace("typing.", "")
    else:
        origin = typing.get_origin(annotation)
        if origin in (list, tuple, set):
            args = typing.get_args(annotation)
            item_schema = schema_type(args[0]) if args else {}
            return {"type": "array", "items": item_schema}
        if origin is dict:
            return {"type": "object"}
        if origin in (typing.Union, types.UnionType):
            args = [arg for arg in typing.get_args(annotation) if arg is not type(None)]
            if len(args) == 1:
                return schema_type(args[0])
            return {}
        text = getattr(annotation, "__name__", str(annotation)).replace("typing.", "")
    normalized = text.lower()
    if normalized in ("str", "string"):
        return {"type": "string"}
    if normalized in ("int", "integer"):
        return {"type": "integer"}
    if normalized in ("float", "number"):
        return {"type": "number"}
    if normalized in ("bool", "boolean"):
        return {"type": "boolean"}
    if normalized.startswith(("list", "tuple", "set")):
        match = re.search(r"\[(.+)\]", text)
        return {"type": "array", "items": schema_type(match.group(1)) if match else {}}
    if normalized.startswith("dict") or normalized in ("mapping", "object"):
        return {"type": "object"}
    return {}

def tool_name_for(path):
    parts = re.sub(r"[^a-zA-Z0-9]+", "_", path).strip("_").lower()
    return f"python_{parts}"

def schema_for(fn):
    signature = inspect.signature(fn)
    properties = {}
    required = []
    for name, parameter in signature.parameters.items():
        if name in ("self", "cls"):
            continue
        properties[name] = schema_type(parameter.annotation)
        if parameter.default is inspect._empty:
            required.append(name)
    return {"type": "object", "properties": properties, "required": required}

def tool_for(fn, path):
    doc = inspect.getdoc(fn) or ""
    return {
        "name": tool_name_for(path),
        "module": request["module"],
        "functionName": path,
        "description": doc.splitlines()[0] if doc else f"Call {path}.",
        "inputSchema": schema_for(fn),
    }

def iter_public_functions(root):
    for name in public_names(root):
        candidate = getattr(root, name, None)
        if inspect.isfunction(candidate):
            yield name, candidate
        elif inspect.isclass(candidate) and getattr(candidate, "__module__", "") == request["module"]:
            for member_name in public_names(candidate):
                if member_name in ("mro",):
                    continue
                descriptor = inspect.getattr_static(candidate, member_name, None)
                target = getattr(candidate, member_name, None)
                if isinstance(descriptor, property):
                    continue
                if not inspect.isfunction(target) and not inspect.ismethod(target):
                    continue
                yield f"{name}.{member_name}", target

def resolve_callable(path):
    parts = path.split(".")
    target = module
    for part in parts:
        target = getattr(target, part)
    if len(parts) == 2:
        class_target = getattr(module, parts[0])
        descriptor = inspect.getattr_static(class_target, parts[1], None)
        if isinstance(descriptor, staticmethod):
            return getattr(class_target, parts[1])
        if isinstance(descriptor, classmethod):
            return getattr(class_target, parts[1])
        if inspect.isfunction(target):
            instance = class_target()
            return getattr(instance, parts[1])
    return target

if request["op"] == "inspect":
    if module is None:
        raise SystemExit("inspect requires module")
    tools = []
    seen = set()
    for path, candidate in iter_public_functions(module):
        tool = tool_for(candidate, path)
        if tool["name"] in seen:
            continue
        seen.add(tool["name"])
        tools.append(tool)
    print(json.dumps(tools[: request["maxTools"]]))
elif request["op"] == "call":
    if module is None:
        raise SystemExit("call requires module")
    fn = resolve_callable(request["functionName"])
    print(json.dumps(fn(*request["args"])))
elif request["op"] == "run_code":
    namespace = {"__name__": "__git2mcp_run_code__"}
    stdout = io.StringIO()
    with contextlib.redirect_stdout(stdout):
        exec(compile(request["code"], "<git2mcp-run-code>", "exec"), namespace, namespace)
    print(json.dumps({"stdout": stdout.getvalue(), "result": namespace.get("result")}))
else:
    raise SystemExit(f"unsupported op: {request['op']}")
`;

export class SubprocessPythonSandboxRunner implements SandboxRunner {
  constructor(
    private readonly options: {
      readonly pythonBin?: string;
      readonly timeoutMs?: number;
      readonly policy?: Partial<SandboxPolicy>;
    } = {},
  ) {}

  async inspect(request: PythonInspectRequest): Promise<readonly PythonFunctionTool[]> {
    return (await this.runBridge({ ...request, op: "inspect" })) as readonly PythonFunctionTool[];
  }

  async call(request: PythonCallRequest): Promise<unknown> {
    return this.runBridge({ ...request, op: "call" });
  }

  async runCode(request: PythonRunCodeRequest): Promise<PythonRunCodeResult> {
    return (await this.runBridge({ ...request, op: "run_code" })) as PythonRunCodeResult;
  }

  private async runBridge(request: Record<string, unknown>): Promise<unknown> {
    const pythonBin = this.options.pythonBin ?? "python3";
    const requestPolicy =
      typeof request.policy === "object" && request.policy !== null ? request.policy : {};
    const policy = { ...defaultPolicy, ...this.options.policy, ...requestPolicy };
    const timeoutMs = this.options.timeoutMs ?? policy.timeoutMs;
    const sandboxRoot = await mkdtemp(path.join(tmpdir(), "qdai-git2mcp-"));

    try {
      return await new Promise((resolve, reject) => {
        const child = spawn(pythonBin, ["-c", pythonBridge], {
          env: {
            PATH: process.env.PATH ?? "",
            PYTHONIOENCODING: "utf-8",
            SystemRoot: process.env.SystemRoot ?? "",
            TEMP: sandboxRoot,
            TMP: sandboxRoot,
            TMPDIR: sandboxRoot,
          },
          cwd: sandboxRoot,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });
        let settled = false;
        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        };
        const timer = setTimeout(() => {
          child.kill();
          fail(new Error(`sandbox timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
          if (stdout.length > policy.outputLimitBytes) {
            child.kill();
            fail(new Error(`sandbox stdout exceeded ${policy.outputLimitBytes} bytes`));
          }
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
          if (stderr.length > policy.outputLimitBytes) {
            child.kill();
            fail(new Error(`sandbox stderr exceeded ${policy.outputLimitBytes} bytes`));
          }
        });
        child.on("error", (error) => {
          fail(error);
        });
        child.on("close", (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (code !== 0) {
            reject(new Error(stderr.trim() || `sandbox exited with code ${code}`));
            return;
          }
          try {
            resolve(JSON.parse(stdout));
          } catch (error) {
            reject(error);
          }
        });
        child.stdin.end(JSON.stringify({ ...request, policy, sandboxRoot }));
      });
    } finally {
      await rm(sandboxRoot, { force: true, recursive: true }).catch(() => undefined);
    }
  }
}

export class TypeScriptSandboxRunner implements TypeScriptRunner {
  constructor(
    private readonly options: {
      readonly timeoutMs?: number;
      readonly policy?: Partial<SandboxPolicy>;
    } = {},
  ) {}

  async inspect(request: TypeScriptInspectRequest): Promise<readonly TypeScriptFunctionTool[]> {
    const entrypoint = resolveTypeScriptEntrypoint(request.packageRoot, request.entrypoint);
    const source = await readFile(entrypoint, "utf8");
    const sourceFile = ts.createSourceFile(entrypoint, source, ts.ScriptTarget.ES2023, true);
    const tools: TypeScriptFunctionTool[] = [];

    for (const statement of sourceFile.statements) {
      if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
      if (!isExported(statement)) continue;

      const exportName = statement.name.text;
      tools.push({
        name: `typescript_${exportName}`,
        entrypoint: path.relative(request.packageRoot, entrypoint).split(path.sep).join("/"),
        exportName,
        description: jsDocSummary(statement) ?? `Call TypeScript export ${exportName}.`,
        inputSchema: schemaForTypeScriptFunction(statement),
      });
    }

    return tools.slice(0, request.maxTools);
  }

  async call(request: TypeScriptCallRequest): Promise<unknown> {
    const entrypoint = resolveTypeScriptEntrypoint(request.packageRoot, request.entrypoint);
    const source = await readFile(entrypoint, "utf8");
    const policy = { ...defaultPolicy, ...this.options.policy, ...request.policy };
    const timeoutMs = this.options.timeoutMs ?? policy.timeoutMs;
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2023,
        esModuleInterop: true,
      },
      fileName: entrypoint,
    }).outputText;
    const exportsObject: Record<string, unknown> = {};
    const moduleObject = { exports: exportsObject };
    const context = vm.createContext({
      exports: exportsObject,
      module: moduleObject,
      require: () => {
        throw new Error("sandbox denied module import");
      },
      __args: request.args,
      __name: request.exportName,
      __result: undefined,
    });

    vm.runInContext(transpiled, context, { filename: entrypoint, timeout: timeoutMs });
    vm.runInContext(
      `
const fn = module.exports[__name] ?? exports[__name];
if (typeof fn !== "function") throw new Error("Unknown TypeScript export: " + __name);
__result = fn(...__args);
`,
      context,
      { timeout: timeoutMs },
    );
    const result = context.__result;
    const encoded = JSON.stringify(result);
    if (encoded && encoded.length > policy.outputLimitBytes) {
      throw new Error(`sandbox result exceeded ${policy.outputLimitBytes} bytes`);
    }
    return result;
  }
}

export async function buildGit2McpManifest(
  options: {
    readonly packageName?: string;
    readonly module?: string;
    readonly packageRoot?: string;
    readonly maxTools?: number;
    readonly runner?: SandboxRunner;
    readonly sandbox?: Partial<SandboxPolicy>;
    readonly supplyChain?: SupplyChainPolicy;
  } = {},
): Promise<Git2McpManifest> {
  const packageRoot = options.packageRoot ?? fixturePackageRoot();
  await access(packageRoot);
  const module = options.module ?? "qdai_git_fixture";
  const runner = options.runner ?? new SubprocessPythonSandboxRunner();
  const sandbox = { ...defaultPolicy, ...options.sandbox };
  const tools = await runner.inspect({
    module,
    packageRoot,
    maxTools: options.maxTools ?? 3,
    policy: sandbox,
  });

  return {
    packageName: options.packageName ?? "qdai-git-fixture",
    runtime: "python",
    sandbox,
    supplyChain: validateSupplyChainPolicy(options.supplyChain ?? defaultSupplyChainPolicy),
    tools,
  };
}

export async function buildTypeScriptGit2McpManifest(
  options: {
    readonly packageName?: string;
    readonly entrypoint?: string;
    readonly packageRoot?: string;
    readonly maxTools?: number;
    readonly runner?: TypeScriptRunner;
    readonly sandbox?: Partial<SandboxPolicy>;
    readonly supplyChain?: SupplyChainPolicy;
  } = {},
): Promise<TypeScriptGit2McpManifest> {
  const packageRoot = options.packageRoot ?? fixtureTypeScriptPackageRoot();
  await access(packageRoot);
  const runner = options.runner ?? new TypeScriptSandboxRunner();
  const sandbox = { ...defaultPolicy, ...options.sandbox };
  const tools = await runner.inspect({
    packageRoot,
    entrypoint: options.entrypoint,
    maxTools: options.maxTools ?? 10,
    policy: sandbox,
  });

  return {
    packageName: options.packageName ?? "@quickdeployai/git-2-mcp-ts-fixture",
    runtime: "node",
    sandbox,
    supplyChain: validateSupplyChainPolicy(
      options.supplyChain ?? defaultTypeScriptSupplyChainPolicy,
    ),
    tools,
  };
}

export async function callGit2McpTool(options: {
  readonly manifest: Git2McpManifest;
  readonly toolName: string;
  readonly packageRoot?: string;
  readonly args: readonly unknown[];
  readonly runner?: SandboxRunner;
}): Promise<unknown> {
  const tool = options.manifest.tools.find((candidate) => candidate.name === options.toolName);
  if (!tool) {
    throw new Error(`Unknown git-2-mcp tool: ${options.toolName}`);
  }
  const runner = options.runner ?? new SubprocessPythonSandboxRunner();
  return runner.call({
    module: tool.module,
    packageRoot: options.packageRoot ?? fixturePackageRoot(),
    functionName: tool.functionName,
    args: options.args,
    policy: options.manifest.sandbox,
  });
}

export class InMemoryGit2McpContentStore implements Git2McpContentStore {
  private readonly content = new Map<string, string>();
  private nextId = 1;

  async write(content: string, metadata: { readonly mime: string }): Promise<Git2McpContentRef> {
    const id = `git2mcp-content-${this.nextId}`;
    this.nextId += 1;
    this.content.set(id, content);
    return {
      id,
      mime: metadata.mime,
      charLength: content.length,
    };
  }

  async read(id: string): Promise<string> {
    const content = this.content.get(id);
    if (content === undefined) {
      throw new Error(`Unknown git-2-mcp ContentRef: ${id}`);
    }
    return content;
  }
}

export async function buildGit2McpRuntimeSurface(
  options: {
    readonly manifest?: Git2McpManifest;
    readonly packageRoot?: string;
    readonly module?: string;
    readonly runner?: SandboxRunner;
    readonly contentStore?: Git2McpContentStore;
    readonly inlineOutputLimitBytes?: number;
    readonly sandbox?: Partial<SandboxPolicy>;
  } = {},
): Promise<Git2McpRuntimeSurface> {
  const packageRoot = options.packageRoot ?? fixturePackageRoot();
  const runner = options.runner ?? new SubprocessPythonSandboxRunner();
  const contentStore = options.contentStore ?? new InMemoryGit2McpContentStore();
  const manifest =
    options.manifest ??
    (await buildGit2McpManifest({
      module: options.module,
      packageRoot,
      runner,
      sandbox: options.sandbox,
    }));
  const docs = await collectPackageDocs(packageRoot, manifest.tools);
  const inlineOutputLimitBytes =
    options.inlineOutputLimitBytes ?? manifest.sandbox.outputLimitBytes;

  const docsSearchTool = {
    name: "docs_search",
    description: "Search package README, docs, and curated API docstrings before calling tools.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        topK: { type: "integer" },
      },
      required: ["query"],
    },
  } as const;
  const runCodeTool = {
    name: "run_code",
    description: "Execute bounded Python code against the installed package for long-tail API use.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
      },
      required: ["code"],
    },
  } as const;

  return {
    tools: [...manifest.tools, docsSearchTool, runCodeTool],
    async searchDocs(request) {
      return searchGit2McpDocs(docs, request);
    },
    async callTool(request) {
      if (request.name === "docs_search") {
        return inlineOrContentRef(
          searchGit2McpDocs(docs, {
            query: stringInput(request, "query"),
            topK: integerInput(request, "topK"),
          }),
          contentStore,
          inlineOutputLimitBytes,
        );
      }
      if (request.name === "run_code") {
        return inlineOrContentRef(
          await runner.runCode({
            packageRoot,
            code: requiredCode(request),
            policy: manifest.sandbox,
          }),
          contentStore,
          inlineOutputLimitBytes,
        );
      }

      return inlineOrContentRef(
        await callGit2McpTool({
          manifest,
          packageRoot,
          runner,
          toolName: request.name,
          args: request.args ?? [],
        }),
        contentStore,
        inlineOutputLimitBytes,
      );
    },
  };
}

export async function callTypeScriptTool(options: {
  readonly manifest: TypeScriptGit2McpManifest;
  readonly toolName: string;
  readonly packageRoot?: string;
  readonly args: readonly unknown[];
  readonly runner?: TypeScriptRunner;
}): Promise<unknown> {
  const tool = options.manifest.tools.find((candidate) => candidate.name === options.toolName);
  if (!tool) {
    throw new Error(`Unknown git-2-mcp tool: ${options.toolName}`);
  }
  const runner = options.runner ?? new TypeScriptSandboxRunner();
  return runner.call({
    packageRoot: options.packageRoot ?? fixtureTypeScriptPackageRoot(),
    entrypoint: tool.entrypoint,
    exportName: tool.exportName,
    args: options.args,
    policy: options.manifest.sandbox,
  });
}

export function fixturePackageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "fixtures", "qdpkg");
}

export function fixtureTypeScriptPackageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "fixtures", "ts-pkg");
}

async function collectPackageDocs(
  packageRoot: string,
  tools: readonly PythonFunctionTool[],
): Promise<readonly Git2McpDocsSearchResult[]> {
  const docs: Git2McpDocsSearchResult[] = tools.map((tool) => ({
    title: tool.functionName,
    source: `docstring:${tool.module}.${tool.functionName}`,
    text: tool.description,
  }));
  docs.push(...(await readPackageDocFiles(packageRoot)));
  return docs;
}

async function readPackageDocFiles(
  packageRoot: string,
): Promise<readonly Git2McpDocsSearchResult[]> {
  const docs: Git2McpDocsSearchResult[] = [];
  for (const relativePath of ["README.md", "README", "docs"]) {
    await collectDocPath(packageRoot, relativePath, docs);
  }
  return docs;
}

async function collectDocPath(
  packageRoot: string,
  relativePath: string,
  docs: Git2McpDocsSearchResult[],
): Promise<void> {
  const absolutePath = path.resolve(packageRoot, relativePath);
  const relative = path.relative(packageRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return;

  try {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      await collectDocPath(packageRoot, path.join(relativePath, entry.name), docs);
    }
    return;
  } catch {
    // Not a directory; try it as a file below.
  }

  if (!/\.(md|mdx|rst|txt)$/i.test(relativePath) && path.basename(relativePath) !== "README") {
    return;
  }

  try {
    const text = (await readFile(absolutePath, "utf8")).trim();
    if (!text) return;
    docs.push({
      title: firstMarkdownHeading(text) ?? path.basename(relativePath),
      source: relativePath.split(path.sep).join("/"),
      text,
    });
  } catch {
    return;
  }
}

function firstMarkdownHeading(text: string): string | undefined {
  return text.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim();
}

function searchGit2McpDocs(
  docs: readonly Git2McpDocsSearchResult[],
  request: Git2McpDocsSearchRequest,
): Git2McpDocsSearchResponse {
  const tokens = request.query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const topK = request.topK ?? 5;
  const results = docs
    .map((doc) => ({
      doc,
      score: tokens.reduce(
        (sum, token) =>
          sum +
          (doc.title.toLowerCase().includes(token) ? 2 : 0) +
          (doc.text.toLowerCase().includes(token) ? 1 : 0),
        0,
      ),
    }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) => right.score - left.score || left.doc.source.localeCompare(right.doc.source),
    )
    .slice(0, topK)
    .map(({ doc }) => doc);

  return {
    query: request.query,
    results,
  };
}

async function inlineOrContentRef(
  value: unknown,
  contentStore: Git2McpContentStore,
  inlineOutputLimitBytes: number,
): Promise<Git2McpToolResult> {
  const encoded = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (encoded.length <= inlineOutputLimitBytes) {
    return {
      kind: "inline",
      value,
    };
  }

  const contentRef = await contentStore.write(encoded, { mime: "application/json" });
  return {
    kind: "contentRef",
    id: contentRef.id,
    text: `ContentRef ${contentRef.id} is required; output length ${contentRef.charLength} exceeds response cap ${inlineOutputLimitBytes}.`,
    contentRef,
  };
}

function requiredCode(request: { readonly code?: string }): string {
  if (typeof request.code !== "string" || request.code.trim().length === 0) {
    throw new Error("run_code requires non-empty code");
  }
  return request.code;
}

function stringInput(request: { readonly args?: readonly unknown[] }, name: string): string {
  const [value] = request.args ?? [];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function integerInput(
  request: { readonly args?: readonly unknown[] },
  name: string,
): number | undefined {
  const [, value] = request.args ?? [];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}

function resolveTypeScriptEntrypoint(packageRoot: string, entrypoint = "src/index.ts"): string {
  const root = path.resolve(packageRoot);
  const candidate = path.resolve(root, entrypoint);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("TypeScript entrypoint must stay within the package root");
  }
  return candidate;
}

function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ===
        true
    : false;
}

function jsDocSummary(node: ts.Node): string | undefined {
  const comments = ts.getJSDocCommentsAndTags(node);
  const comment = comments.find(ts.isJSDoc);
  if (!comment || typeof comment.comment !== "string") return undefined;
  const [summary] = comment.comment.split(/\r?\n/, 1);
  return summary?.trim() || undefined;
}

function schemaForTypeScriptFunction(
  fn: ts.FunctionDeclaration,
): TypeScriptFunctionTool["inputSchema"] {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const parameter of fn.parameters) {
    if (!ts.isIdentifier(parameter.name)) continue;
    const name = parameter.name.text;
    properties[name] = { type: typeScriptTypeToJsonType(parameter.type) };
    if (!parameter.questionToken && !parameter.initializer) required.push(name);
  }

  return { type: "object", properties, required };
}

function typeScriptTypeToJsonType(type: ts.TypeNode | undefined): string {
  if (!type) return "string";
  switch (type.kind) {
    case ts.SyntaxKind.NumberKeyword:
      return "integer";
    case ts.SyntaxKind.BooleanKeyword:
      return "boolean";
    case ts.SyntaxKind.ArrayType:
      return "array";
    case ts.SyntaxKind.TypeLiteral:
      return "object";
    case ts.SyntaxKind.StringKeyword:
    default:
      return "string";
  }
}
