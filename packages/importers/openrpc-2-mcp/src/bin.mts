#!/usr/bin/env tsx
import { buildOpenRpcTools, loadOpenRpcDocument, type BuildOpenRpcToolsOptions } from "./index.js";

type CommonOptions = {
  spec?: string;
  endpoint?: string;
  transport?: "http" | "ws";
};

type CallOptions = CommonOptions & {
  method?: string;
  args?: string;
};

const [command, ...args] = process.argv.slice(2);

if (command === "catalog") {
  const options = parseCommonOptions(args);
  const tools = await buildTools(options);
  process.stdout.write(
    `${JSON.stringify(
      tools.map(({ execute: _execute, parameters: _parameters, ...tool }) => tool),
      null,
      2,
    )}\n`,
  );
} else if (command === "call") {
  const options = parseCallOptions(args);
  const tools = await buildTools(options);
  const methodName = requireOption(options.method, "--method");
  const tool = tools.find((candidate) => candidate.name === methodName || candidate.method === methodName);
  if (!tool) {
    throw new Error(`Unknown tool/method "${methodName}". Run "catalog" to list available tools.`);
  }
  const result = await tool.execute(options.args ? JSON.parse(options.args) : {});
  process.stdout.write(`${result}\n`);
} else {
  process.stdout.write(
    [
      "Usage:",
      "  openrpc-2-mcp catalog --spec <file.openrpc.json|url> --endpoint <url> [--transport http|ws]",
      "  openrpc-2-mcp call --spec <file.openrpc.json|url> --endpoint <url> --method <name> [--args '<json>'] [--transport http|ws]",
      "",
      "Prints the MCP tool catalog for an OpenRPC document, or invokes a single method against a running endpoint.",
      "",
    ].join("\n"),
  );
}

async function buildTools(options: CommonOptions) {
  const model = await loadOpenRpcDocument(requireOption(options.spec, "--spec"));
  const runtimeOptions: BuildOpenRpcToolsOptions = {
    endpoint: requireOption(options.endpoint, "--endpoint"),
    transport: options.transport ?? "http",
  };
  return buildOpenRpcTools(model, runtimeOptions);
}

function parseCommonOptions(args: string[]): CommonOptions {
  const options: CommonOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    switch (arg) {
      case "--spec":
        options.spec = requireOption(value, arg);
        index += 1;
        break;
      case "--endpoint":
        options.endpoint = requireOption(value, arg);
        index += 1;
        break;
      case "--transport":
        options.transport = requireOption(value, arg) === "ws" ? "ws" : "http";
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument ${arg}.`);
    }
  }
  return options;
}

function parseCallOptions(args: string[]): CallOptions {
  const options: CallOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    switch (arg) {
      case "--spec":
        options.spec = requireOption(value, arg);
        index += 1;
        break;
      case "--endpoint":
        options.endpoint = requireOption(value, arg);
        index += 1;
        break;
      case "--transport":
        options.transport = requireOption(value, arg) === "ws" ? "ws" : "http";
        index += 1;
        break;
      case "--method":
        options.method = requireOption(value, arg);
        index += 1;
        break;
      case "--args":
        options.args = requireOption(value, arg);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument ${arg}.`);
    }
  }
  return options;
}

function requireOption(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`Missing value for ${flag}.`);
  return value;
}
