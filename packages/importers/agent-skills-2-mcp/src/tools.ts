import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createMxcSandboxRunner, type MxcCommandRunner } from "@quickdeployai/importer-core";
import type { LoadedSkill } from "./skill-loader.js";
import { buildSkillCatalog, normalizeSkills, skillResourceUris } from "./catalog.js";

const RUNNABLE_SCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".sh"]);
const MAX_ARGUMENTS_LENGTH = 8_192;
const MAX_ARGUMENT_COUNT = 64;
const MAX_SINGLE_ARGUMENT_LENGTH = 1_024;
const SCRIPT_TIMEOUT_MS = 30_000;
const SCRIPT_MAX_BUFFER_BYTES = 1024 * 1024;

export interface ScriptSandboxRequest {
  skillDir: string;
  scriptPath: string;
  args: string[];
  envPassthrough: string[];
}

export interface ScriptSandboxResult {
  stdout: string;
  stderr: string;
}

export type ScriptSandboxRunner = (request: ScriptSandboxRequest) => Promise<ScriptSandboxResult>;

export interface ToolRegistrationOptions {
  allowedScripts?: readonly string[];
  envPassthrough?: readonly string[];
  sandboxRunner?: ScriptSandboxRunner;
  mxcRunner?: MxcCommandRunner;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ScriptTool extends ToolDefinition {
  _scriptPath: string;
  _skillDir: string;
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true;
  }
  return false;
}

function toolNameFromScript(filename: string): string {
  return path.basename(filename, path.extname(filename)).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function isRunnableScript(filename: string): boolean {
  return RUNNABLE_SCRIPT_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

export function parseCommaSeparatedList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isScriptAllowed(script: string, allowedScripts: ReadonlySet<string>): boolean {
  if (allowedScripts.size === 0) return false;

  const baseName = path.basename(script);
  const toolName = toolNameFromScript(script);
  return allowedScripts.has(script) || allowedScripts.has(baseName) || allowedScripts.has(toolName);
}

export function normalizeScriptArgs(value: unknown): string[] {
  const args = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim()
      ? value.trim().split(/\s+/)
      : [];

  if (args.length > MAX_ARGUMENT_COUNT) {
    throw new Error(`Too many script arguments; maximum is ${MAX_ARGUMENT_COUNT}`);
  }

  return args.map((arg) => {
    if (typeof arg !== "string") {
      throw new Error("Script arguments must be strings");
    }
    if (arg.length > MAX_SINGLE_ARGUMENT_LENGTH) {
      throw new Error(`Script argument exceeds ${MAX_SINGLE_ARGUMENT_LENGTH} characters`);
    }
    if (containsControlCharacter(arg)) {
      throw new Error("Script arguments must not contain control characters");
    }
    return arg;
  });
}

function resolveInside(parentDir: string, childPath: string): string {
  const resolvedParent = path.resolve(parentDir);
  const resolvedChild = path.resolve(childPath);
  const relative = path.relative(resolvedParent, resolvedChild);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes sandbox root: ${childPath}`);
  }

  return resolvedChild;
}

function buildCommand(scriptPath: string): { command: string; args: string[] } {
  const extension = path.extname(scriptPath).toLowerCase();

  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return { command: process.execPath, args: [scriptPath] };
  }

  return { command: scriptPath, args: [] };
}

function buildSandboxEnv(envPassthrough: readonly string[], sandboxDir: string): Record<string, string> {
  const env: Record<string, string> = {
    TMPDIR: sandboxDir,
    TEMP: sandboxDir,
    TMP: sandboxDir,
  };

  for (const name of ["SystemRoot", "WINDIR"]) {
    if (process.env[name]) env[name] = process.env[name];
  }

  for (const name of envPassthrough) {
    if (process.env[name] !== undefined) env[name] = process.env[name]!;
  }

  return env;
}

export function createLocalSandboxRunner(
  mxcRunner: MxcCommandRunner = createMxcSandboxRunner(),
): ScriptSandboxRunner {
  return async ({ skillDir, scriptPath, args, envPassthrough }) => {
    const scriptsDir = path.join(skillDir, "scripts");
    const safeScriptPath = resolveInside(scriptsDir, scriptPath);
    const scriptStats = await fs.lstat(safeScriptPath);
    if (scriptStats.isSymbolicLink()) {
      throw new Error("Script symlinks are not allowed");
    }

    const relativeScriptPath = path.relative(skillDir, safeScriptPath);
    const sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skills-mcp-"));

    try {
      const sandboxSkillDir = path.join(sandboxRoot, "skill");
      await fs.cp(skillDir, sandboxSkillDir, {
        recursive: true,
        dereference: false,
        filter: (source) => path.basename(source) !== "node_modules",
      });

      const sandboxScriptPath = resolveInside(
        sandboxSkillDir,
        path.join(sandboxSkillDir, relativeScriptPath),
      );
      const command = buildCommand(sandboxScriptPath);
      const result = await mxcRunner.run({
        commandLine: [command.command, ...command.args, ...args].map(quoteCommandArg).join(" "),
        cwd: sandboxSkillDir,
        env: buildSandboxEnv(envPassthrough, sandboxRoot),
        readonlyPaths: [sandboxSkillDir],
        readwritePaths: [sandboxRoot],
        allowOutbound: false,
        timeoutMs: SCRIPT_TIMEOUT_MS,
        outputLimitBytes: SCRIPT_MAX_BUFFER_BYTES,
      });
      if (result.exitCode !== 0) {
        throw new Error(result.stderr.trim() || `MXC sandbox exited with code ${result.exitCode}`);
      }

      return { stdout: result.stdout, stderr: result.stderr };
    } finally {
      await fs.rm(sandboxRoot, { recursive: true, force: true });
    }
  };
}

function quoteCommandArg(value: string): string {
  if (process.platform === "win32") {
    return `"${value.replace(/(["\\])/g, "\\$1")}"`;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function registerTools(
  server: Server,
  skillOrSkills: LoadedSkill | readonly LoadedSkill[],
  options: ToolRegistrationOptions = {},
): void {
  const skills = normalizeSkills(skillOrSkills);
  const allowedScripts = new Set(
    options.allowedScripts ?? parseCommaSeparatedList(process.env.SKILLS_MCP_SCRIPT_ALLOWLIST),
  );
  const envPassthrough =
    options.envPassthrough ?? parseCommaSeparatedList(process.env.SKILLS_MCP_SCRIPT_ENV_ALLOWLIST);
  const sandboxRunner = options.sandboxRunner ?? createLocalSandboxRunner(options.mxcRunner);

  const promptTools: ToolDefinition[] = [
    {
      name: "list-prompts",
      description: "List available skill prompts and their resource links",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "call-prompt",
      description: "Return a skill prompt body for tool-only MCP clients",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Skill prompt name",
          },
        },
        required: ["name"],
      },
    },
  ];

  const scriptTools: ScriptTool[] = skills.flatMap((skill) =>
    skill.scripts
      .filter(isRunnableScript)
      .filter((script) => isScriptAllowed(script, allowedScripts))
      .map((script) => ({
        name: toolNameFromScript(script),
        description: `Run ${script} script from skill "${skill.frontmatter.name}"`,
        inputSchema: {
          type: "object" as const,
          properties: {
            args: {
              oneOf: [
                { type: "string" },
                { type: "array", items: { type: "string" }, maxItems: MAX_ARGUMENT_COUNT },
              ],
              description: "Command-line arguments to pass to the script",
            },
          },
        },
        _scriptPath: path.join(skill.skillDir, "scripts", script),
        _skillDir: skill.skillDir,
      })),
  );

  server.setRequestHandler({ method: "tools/list" } as any, async () => ({
    tools: [...promptTools, ...scriptTools.map(({ _scriptPath, _skillDir, ...tool }) => tool)],
  }));

  server.setRequestHandler({ method: "tools/call" } as any, async (request: any) => {
    const toolName = request.params?.name;

    if (toolName === "list-prompts") {
      const catalog = buildSkillCatalog(skills);
      return {
        content: [
          {
            type: "text",
            text: catalog.map((entry) => `${entry.id}: ${entry.description}`).join("\n"),
          },
        ],
        structuredContent: {
          prompts: catalog,
        },
      };
    }

    if (toolName === "call-prompt") {
      const promptName = request.params?.arguments?.name;
      const skill = skills.find((candidate) => candidate.frontmatter.name === promptName);

      if (!skill) {
        throw new Error(`Unknown prompt: ${promptName}`);
      }

      return {
        content: [
          {
            type: "text",
            text: skill.body,
          },
        ],
        _meta: {
          quickdeploy: {
            resources: skillResourceUris(skill),
          },
        },
      };
    }

    const tool = scriptTools.find((t) => t.name === toolName);

    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const rawArgs = request.params?.arguments?.args ?? "";
    if (typeof rawArgs === "string" && rawArgs.length > MAX_ARGUMENTS_LENGTH) {
      throw new Error(`Script argument payload exceeds ${MAX_ARGUMENTS_LENGTH} characters`);
    }
    const scriptArgs = normalizeScriptArgs(rawArgs);

    try {
      const { stdout, stderr } = await sandboxRunner({
        skillDir: tool._skillDir,
        scriptPath: tool._scriptPath,
        args: scriptArgs,
        envPassthrough: [...envPassthrough],
      });

      return {
        content: [
          {
            type: "text",
            text: stdout + (stderr ? `\n\nSTDERR:\n${stderr}` : ""),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: `Script execution failed: ${err.message}\n${err.stderr ?? ""}`,
          },
        ],
        isError: true,
      };
    }
  });
}
