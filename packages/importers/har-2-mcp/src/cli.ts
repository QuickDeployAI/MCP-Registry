import { readFile, writeFile } from "node:fs/promises";
import { Command } from "commander";
import { convertHarToOpenApi, loadHarArchive } from "./convert";
import type { RedactionReport } from "./redact";
import { reviewHarDraft } from "./review";
import { buildHarMcpTools } from "./serve";
import type { OpenApiDocument } from "./types";

type ConvertOptions = { har: string; out: string; redactionReport: string; title: string };
type ReviewOptions = { draft: string; redactionReport: string; out: string; accept?: boolean };
type ServeOptions = { spec: string; baseUrl: string };

/**
 * `har-2-mcp` is a two-step-by-design importer:
 *
 *   1. `convert` — HAR capture -> draft OpenAPI spec + redaction report (never runnable).
 *   2. `review --accept` — a human checks the redaction report, then explicitly
 *      accepts it to produce a reviewed spec.
 *   3. `serve` — only a reviewed spec can be handed to the openapi-2-mcp engine.
 *
 * See ./convert.ts, ./review.ts, and ./serve.ts for why each step exists and refuses
 * to be skipped.
 */
export function createHar2McpCommand(): Command {
  const command = new Command("har-2-mcp").description(
    "Convert HAR captures into a reviewed OpenAPI contract before serving MCP tools.",
  );

  command
    .command("convert")
    .description("Convert a HAR capture into a draft OpenAPI spec and a redaction report.")
    .requiredOption("--har <path>", "Path to the captured .har file")
    .requiredOption("--out <path>", "Output path for the draft OpenAPI spec")
    .requiredOption("--redaction-report <path>", "Output path for the redaction report")
    .option("--title <title>", "OpenAPI info.title", "HAR Capture")
    .action(async (options: ConvertOptions) => {
      const har = await loadHarArchive({ harPath: options.har });
      const result = convertHarToOpenApi({ har, title: options.title });
      await writeFile(options.out, `${JSON.stringify(result.openapi, null, 2)}\n`, "utf8");
      await writeFile(
        options.redactionReport,
        `${JSON.stringify(result.redactionReport, null, 2)}\n`,
        "utf8",
      );
      process.stdout.write(
        `Wrote draft spec to ${options.out} and redaction report ` +
          `(${result.redactionReport.findings.length} finding(s)) to ${options.redactionReport}.\n` +
          "This draft is NOT servable yet. Review the redaction report, then run " +
          "`har-2-mcp review --accept` to produce a reviewed spec.\n",
      );
    });

  command
    .command("review")
    .description("Accept a redaction report and mark a draft spec reviewed.")
    .requiredOption("--draft <path>", "Path to the draft OpenAPI spec")
    .requiredOption("--redaction-report <path>", "Path to the redaction report")
    .requiredOption("--out <path>", "Output path for the reviewed OpenAPI spec")
    .option("--accept", "Confirm the redaction report has been reviewed and is accepted")
    .action(async (options: ReviewOptions) => {
      const draft = JSON.parse(await readFile(options.draft, "utf8")) as OpenApiDocument;
      const redactionReport = JSON.parse(
        await readFile(options.redactionReport, "utf8"),
      ) as RedactionReport;
      const reviewed = reviewHarDraft({
        draft,
        redactionReport,
        accept: Boolean(options.accept),
      });
      await writeFile(options.out, `${JSON.stringify(reviewed, null, 2)}\n`, "utf8");
      process.stdout.write(`Wrote reviewed spec to ${options.out}.\n`);
    });

  command
    .command("serve")
    .description("Build MCP tools from a reviewed OpenAPI spec (refuses unreviewed drafts).")
    .requiredOption("--spec <path>", "Path to the reviewed OpenAPI spec")
    .requiredOption("--base-url <url>", "Base URL for the captured API")
    .action(async (options: ServeOptions) => {
      const spec = JSON.parse(await readFile(options.spec, "utf8")) as OpenApiDocument;
      const tools = buildHarMcpTools({ spec, baseUrl: options.baseUrl });
      process.stdout.write(
        `${JSON.stringify(
          tools.map((tool) => tool.name),
          null,
          2,
        )}\n`,
      );
    });

  return command;
}
