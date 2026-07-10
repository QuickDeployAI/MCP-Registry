import type { ArazzoDocument, ArazzoWorkflow } from "./index.js";
import type { RunWorkflowOptions, WorkflowRunResult } from "./runner.js";

export type ArazzoTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(args: unknown): Promise<WorkflowRunResult>;
};

export type BuildArazzoToolsOptions = Omit<RunWorkflowOptions, "baseUrls"> & {
  /** Base URL overrides keyed by Arazzo sourceDescription name. */
  sourceOverrides?: Readonly<Record<string, string>>;
  /** Workflow IDs to expose. Omit to expose every workflow in document order. */
  workflowAllowlist?: readonly string[];
};

/** Builds one executable MCP-facing tool for each selected Arazzo workflow. */
export function buildArazzoTools(
  document: ArazzoDocument,
  options: BuildArazzoToolsOptions,
): ArazzoTool[] {
  const allowlist = options.workflowAllowlist
    ? new Set(options.workflowAllowlist)
    : undefined;

  return document.workflows
    .filter((workflow) => !allowlist || allowlist.has(workflow.workflowId))
    .map((workflow) => workflowToTool(document, workflow, options));
}

function workflowToTool(
  document: ArazzoDocument,
  workflow: ArazzoWorkflow,
  options: BuildArazzoToolsOptions,
): ArazzoTool {
  return {
    name: workflow.workflowId,
    description:
      workflow.description ?? workflow.summary ?? `Run Arazzo workflow ${workflow.workflowId}`,
    inputSchema: workflowInputSchema(workflow.inputs),
    execute: async (args) => {
      const { runWorkflow } = await import("./runner.js");
      return runWorkflow(document, workflow.workflowId, workflowInputs(args), {
        executor: options.executor,
        sources: options.sources,
        baseUrls: options.sourceOverrides,
        maxSteps: options.maxSteps,
        stepTimeoutMs: options.stepTimeoutMs,
      });
    },
  };
}

function workflowInputSchema(inputs: unknown): Record<string, unknown> {
  if (isRecord(inputs)) return inputs;
  return { type: "object", additionalProperties: false };
}

function workflowInputs(args: unknown): Record<string, unknown> {
  return isRecord(args) ? args : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
