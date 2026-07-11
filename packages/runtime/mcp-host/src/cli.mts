#!/usr/bin/env tsx
import { loadProjectedEntry, loadUserConfigFile } from "./projection-loader";
import { createMcpHost, startHttpHost } from "./runtime";
import { runStdioHost } from "./stdio";

type CliOptions = {
  entryPath: string;
  projectionPath?: string;
  configPath?: string;
  transport?: "stdio" | "streamable-http" | "sse";
  port?: number;
  hostname?: string;
};

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const projected = await loadProjectedEntry(options.entryPath, options.projectionPath);
  const userConfig = await loadUserConfigFile(options.configPath);
  const host = await createMcpHost({ ...projected, userConfig });
  const transport = options.transport ?? projected.projection.deployment.transport;

  if (transport === "stdio") {
    await runStdioHost(host);
    return;
  }

  if (transport !== "streamable-http") {
    throw new Error(`Transport ${transport} is not implemented by mcp-host yet.`);
  }

  const http = await startHttpHost(host, {
    port: options.port ?? 3000,
    hostname: options.hostname,
  });
  process.stderr.write(`mcp-host listening on ${http.url}\n`);
}

function parseArgs(argv: string[]): CliOptions {
  if (argv[0] === "--") argv = argv.slice(1);
  const [command, entryPath, ...rest] = argv;
  if (command !== "run" || !entryPath) {
    throw new Error(
      "Usage: mcp-host run <entry.ard.json> [--projection file] [--config file] [--transport stdio|streamable-http] [--port 3000]",
    );
  }

  const options: CliOptions = { entryPath };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const value = rest[index + 1];
    switch (arg) {
      case "--projection":
        options.projectionPath = requireValue(arg, value);
        index += 1;
        break;
      case "--config":
        options.configPath = requireValue(arg, value);
        index += 1;
        break;
      case "--transport":
        options.transport = requireValue(arg, value) as CliOptions["transport"];
        index += 1;
        break;
      case "--port":
        options.port = Number(requireValue(arg, value));
        index += 1;
        break;
      case "--hostname":
        options.hostname = requireValue(arg, value);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument ${arg}.`);
    }
  }

  return options;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing value for ${flag}.`);
  return value;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
