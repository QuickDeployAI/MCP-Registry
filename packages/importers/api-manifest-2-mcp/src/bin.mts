#!/usr/bin/env node
import { serveMcpTools } from "@quickdeployai/importer-core/mcp-tools";
import { buildApiManifestTools } from "./index.js";

const USAGE = [
  "Usage:",
  "  api-manifest-2-mcp serve --manifest <manifest.json|url> [--base-url dependency=url] [--port 3000] [--mcp-path /mcp]",
].join("\n");

const [command, ...args] = process.argv.slice(2);
if (command !== "serve") {
  process.stdout.write(`${USAGE}\n`);
} else {
  const options = parseOptions(args);
  const tools = await buildApiManifestTools(required(options.manifest, "--manifest"), {
    baseUrls: options.baseUrls,
  });
  await serveMcpTools({
    name: "api-manifest-2-mcp",
    version: "0.1.0",
    tools,
    port: options.port,
    mcpPath: options.mcpPath,
  });
}

interface Options {
  manifest?: string;
  baseUrls: Record<string, string>;
  port?: number;
  mcpPath?: string;
}

function parseOptions(args: string[]): Options {
  const options: Options = { baseUrls: {} };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = required(args[index + 1], flag ?? "argument");
    if (flag === "--manifest") options.manifest = value;
    else if (flag === "--base-url") {
      const separator = value.indexOf("=");
      if (separator <= 0) throw new Error(`Invalid --base-url value "${value}"; expected key=url.`);
      options.baseUrls[value.slice(0, separator)] = value.slice(separator + 1);
    } else if (flag === "--port") options.port = Number(value);
    else if (flag === "--mcp-path") options.mcpPath = value;
    else throw new Error(`Unknown argument ${flag}.\n${USAGE}`);
    index += 1;
  }
  return options;
}

function required(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`Missing value for ${flag}.\n${USAGE}`);
  return value;
}
