#!/usr/bin/env tsx
import { loadArazzoDocument } from "./index.js";

const USAGE = [
  "Usage: arazzo-2-mcp inspect <document.arazzo.json>",
  "",
  "Validates an Arazzo document and prints its workflow inventory.",
].join("\n");

async function main(argv: string[]): Promise<void> {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const [command, source] = argv;
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

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
