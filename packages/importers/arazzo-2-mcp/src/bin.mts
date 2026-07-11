#!/usr/bin/env tsx
import { serveMcpTools } from "@quickdeployai/importer-core/mcp-tools";
import { z } from "zod";
import { buildArazzoTools, loadArazzoDocument } from "./index.js";
import { resolveArazzoSources } from "./sources.js";

const USAGE = [
  "Usage: arazzo-2-mcp inspect <document.arazzo.json>",
  "       arazzo-2-mcp serve --spec <document.arazzo.json|url> [--source name=url] [--port 3000] [--mcp-path /mcp]",
  "",
  "Validates an Arazzo document and prints its workflow inventory.",
].join("\n");

async function main(argv: string[]): Promise<void> {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const [command, source] = argv;
  if (command === "serve") {
    await serve(argv.slice(1));
    return;
  }
  if (command !== "inspect" || !source) throw new Error(USAGE);

  const document = await loadArazzoDocument(source);
  process.stdout.write(
    `${JSON.stringify(
      {
        title: document.info.title,
        version: document.info.version,
        workflows: document.workflows.map((workflow) => workflow.workflowId),
      },
      null,
      2,
    )}\n`,
  );
}

async function serve(args: string[]): Promise<void> {
  const options = parseServeOptions(args);
  const spec = requireOption(options.spec, "--spec");
  const document = await loadArazzoDocument(spec);
  const sources = await resolveArazzoSources(document, { baseUrl: spec });
  const tools = buildArazzoTools(document, {
    sources,
    sourceOverrides: options.sourceOverrides,
    executor: async ({ url, method, headers, body }) => {
      const response = await fetch(url, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, text: await response.text() };
    },
  }).map((tool) => ({
    ...tool,
    parameters: z.object({}).catchall(z.unknown()),
  }));
  await serveMcpTools({
    name: "arazzo-2-mcp",
    version: "0.1.0",
    tools,
    port: options.port,
    mcpPath: options.mcpPath,
  });
}

interface ServeOptions {
  spec?: string;
  sourceOverrides: Record<string, string>;
  port?: number;
  mcpPath?: string;
}

function parseServeOptions(args: string[]): ServeOptions {
  const options: ServeOptions = { sourceOverrides: {} };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = requireOption(args[index + 1], flag ?? "argument");
    if (flag === "--spec") options.spec = value;
    else if (flag === "--source") {
      const separator = value.indexOf("=");
      if (separator <= 0) throw new Error(`Invalid --source value "${value}"; expected name=url.`);
      options.sourceOverrides[value.slice(0, separator)] = value.slice(separator + 1);
    } else if (flag === "--port") options.port = Number(value);
    else if (flag === "--mcp-path") options.mcpPath = value;
    else throw new Error(`Unknown argument ${flag}.\n${USAGE}`);
    index += 1;
  }
  return options;
}

function requireOption(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`Missing value for ${flag}.\n${USAGE}`);
  return value;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
