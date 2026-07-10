import { readFile } from "node:fs/promises";
import { z } from "zod";

export const ARAZZO_MEDIA_TYPE = "application/vnd.oai.arazzo+json";

const JsonRecordSchema = z.object({}).catchall(z.unknown());

const ArazzoInfoSchema = JsonRecordSchema.extend({
  title: z.string().min(1),
  version: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

const ArazzoSourceDescriptionSchema = JsonRecordSchema.extend({
  name: z.string().min(1),
  url: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
});

const ArazzoStepSchema = JsonRecordSchema.extend({
  stepId: z.string().min(1),
  description: z.string().min(1).optional(),
  operationId: z.string().min(1).optional(),
  operationPath: z.string().min(1).optional(),
  workflowId: z.string().min(1).optional(),
  dependsOn: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
  successCriteria: z.array(JsonRecordSchema).optional(),
});

const ArazzoWorkflowSchema = JsonRecordSchema.extend({
  workflowId: z.string().min(1),
  summary: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  inputs: z.unknown().optional(),
  outputs: z.unknown().optional(),
  successActions: z.array(JsonRecordSchema).optional(),
  failureActions: z.array(JsonRecordSchema).optional(),
  steps: z.array(ArazzoStepSchema).min(1),
});

export const ArazzoDocumentSchema = JsonRecordSchema.extend({
  arazzo: z.string().min(1),
  info: ArazzoInfoSchema,
  sourceDescriptions: z.array(ArazzoSourceDescriptionSchema).default([]),
  workflows: z.array(ArazzoWorkflowSchema).min(1),
});

export type ArazzoDocument = z.infer<typeof ArazzoDocumentSchema>;
export type ArazzoWorkflow = z.infer<typeof ArazzoWorkflowSchema>;
export type ArazzoWorkflowStep = z.infer<typeof ArazzoStepSchema>;
export type ArazzoSourceDescription = z.infer<typeof ArazzoSourceDescriptionSchema>;

export type ArazzoInlineInput = ArazzoDocument | Record<string, unknown> | string | Uint8Array;
export type ArazzoInput = ArazzoInlineInput | URL;

export type ArazzoSourceEntry = {
  identifier: string;
  type: string;
  url?: string;
  displayName?: string;
};

export type ArazzoConversionOptions = {
  sourceUrl?: string;
  sourceEntries?: readonly ArazzoSourceEntry[];
};

export type WorkflowTrigger = {
  id?: string;
  type: "manual" | "webhook" | "schedule" | "event" | "api";
  name?: string;
  description?: string;
};

export type WorkflowStep = {
  id: string;
  name: string;
  action: string;
  capability_ref?: string;
  capability_type?: string;
  description?: string;
  [key: string]: unknown;
};

export type WorkflowRequiredCapability = {
  id: string;
  type: string;
  name: string;
  optional: boolean;
  source_url?: string;
  source_type?: string;
  source_entry_identifier?: string;
};

export type WorkflowCapability = {
  workflow_id: string;
  title: string;
  name: string;
  description?: string;
  version?: string;
  source_url?: string;
  triggers: WorkflowTrigger[];
  steps: WorkflowStep[];
  required_capabilities: WorkflowRequiredCapability[];
  workflow_package: {
    schema: "oneclick.workflow-capability.v1";
    files: Array<{ path: string; content_type: string; content: string }>;
  };
  deploy_targets: string[];
};

export type ArazzoToolReference = {
  stepId: string;
  sourceName?: string;
  operationId?: string;
  operationPath?: string;
  capabilityRef?: string;
};

export type ArazzoWorkflowCapability = {
  kind: "workflow";
  sourceMediaType: typeof ARAZZO_MEDIA_TYPE;
  workflow: WorkflowCapability;
  sourceReferences: WorkflowRequiredCapability[];
  toolReferences: ArazzoToolReference[];
  manifest: ArazzoWorkflow;
};

export class ArazzoImportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ArazzoImportError";
  }
}

export async function loadArazzoDocument(input: ArazzoInput): Promise<ArazzoDocument> {
  return parseArazzoDocument(await readArazzoInput(input));
}

export function parseArazzoDocument(input: unknown): ArazzoDocument {
  return ArazzoDocumentSchema.parse(decodeInlineInput(input));
}

export async function loadArazzoWorkflowCapabilities(
  input: ArazzoInput,
  options: ArazzoConversionOptions = {},
): Promise<ArazzoWorkflowCapability[]> {
  return arazzoToWorkflowCapabilities(await loadArazzoDocument(input), options);
}

export function arazzoToWorkflowCapabilities(
  document: ArazzoDocument,
  options: ArazzoConversionOptions = {},
): ArazzoWorkflowCapability[] {
  const sourceReferences = document.sourceDescriptions.map((source) =>
    sourceDescriptionToRequiredCapability(source, options.sourceEntries ?? []),
  );

  return document.workflows.map((workflow) => {
    const toolReferences = workflow.steps.map((step) =>
      stepToToolReference(step, document.sourceDescriptions),
    );

    return {
      kind: "workflow",
      sourceMediaType: ARAZZO_MEDIA_TYPE,
      workflow: {
        workflow_id: workflow.workflowId,
        title: workflow.summary ?? workflow.workflowId,
        name: workflow.workflowId,
        description: workflow.description ?? document.info.description,
        version: document.info.version,
        source_url: options.sourceUrl,
        triggers: [
          {
            type: "manual",
            name: "Manual start",
            description: workflow.inputs ? "Start with Arazzo workflow inputs." : undefined,
          },
        ],
        steps: workflow.steps.map((step) => stepToWorkflowStep(step, document.sourceDescriptions)),
        required_capabilities: sourceReferences,
        workflow_package: {
          schema: "oneclick.workflow-capability.v1",
          files: [
            {
              path: `${workflow.workflowId}.arazzo.json`,
              content_type: ARAZZO_MEDIA_TYPE,
              content: JSON.stringify(workflow, null, 2),
            },
          ],
        },
        deploy_targets: ["azure-aks"],
      },
      sourceReferences,
      toolReferences,
      manifest: workflow,
    };
  });
}

async function readArazzoInput(input: ArazzoInput): Promise<unknown> {
  if (input instanceof URL) return readFromUrl(input);
  if (typeof input !== "string") return decodeInlineInput(input);

  const trimmed = input.trim();
  if (looksLikeJson(trimmed)) return parseJson(trimmed, "inline Arazzo JSON");

  const asUrl = tryParseUrl(trimmed);
  if (asUrl) return readFromUrl(asUrl);

  return parseJson(await readFile(input, "utf8"), `Arazzo file ${input}`);
}

async function readFromUrl(url: URL): Promise<unknown> {
  if (url.protocol === "file:") {
    return parseJson(await readFile(url, "utf8"), `Arazzo file ${url.href}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ArazzoImportError(`Unsupported Arazzo URL protocol: ${url.protocol}`);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new ArazzoImportError(
      `Failed to fetch Arazzo document ${url.href}: ${response.status} ${response.statusText}`,
    );
  }
  return parseJson(await response.text(), `Arazzo URL ${url.href}`);
}

function decodeInlineInput(input: unknown): unknown {
  if (typeof input === "string") return parseJson(input, "inline Arazzo JSON");
  if (input instanceof Uint8Array) return parseJson(Buffer.from(input).toString("utf8"), "buffer");
  return input;
}

function parseJson(text: string, source: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ArazzoImportError(`Invalid JSON in ${source}.`, { cause: error });
  }
}

function sourceDescriptionToRequiredCapability(
  source: ArazzoSourceDescription,
  sourceEntries: readonly ArazzoSourceEntry[],
): WorkflowRequiredCapability {
  const sourceEntry = findMatchingSourceEntry(source, sourceEntries);
  return {
    id: slug(source.name),
    type: "api-contract",
    name: source.name,
    optional: false,
    source_url: source.url,
    source_type: source.type,
    source_entry_identifier: sourceEntry?.identifier,
  };
}

function stepToWorkflowStep(
  step: ArazzoWorkflowStep,
  sources: readonly ArazzoSourceDescription[],
): WorkflowStep {
  const toolReference = stepToToolReference(step, sources);
  const action =
    toolReference.operationId ?? toolReference.operationPath ?? step.workflowId ?? step.stepId;

  return {
    id: step.stepId,
    name: humanize(step.stepId),
    action,
    capability_ref: toolReference.capabilityRef,
    capability_type: toolReference.capabilityRef
      ? "tool"
      : step.workflowId
        ? "workflow"
        : undefined,
    description: step.description,
    depends_on: normalizeDependsOn(step.dependsOn),
    operation_id: toolReference.operationId,
    operation_path: toolReference.operationPath,
    source_description: toolReference.sourceName,
    success_criteria: step.successCriteria ?? [],
  };
}

function stepToToolReference(
  step: ArazzoWorkflowStep,
  sources: readonly ArazzoSourceDescription[],
): ArazzoToolReference {
  const sourceName = inferStepSourceName(step, sources);
  const operationId = step.operationId;
  const operationPath = step.operationPath;
  const operation = operationId ?? operationPath;
  return {
    stepId: step.stepId,
    sourceName,
    operationId,
    operationPath,
    capabilityRef: sourceName && operation ? `${slug(sourceName)}#${operation}` : operation,
  };
}

export function inferStepSourceName(
  step: ArazzoWorkflowStep,
  sources: readonly ArazzoSourceDescription[],
): string | undefined {
  const explicit = stringValue(step.sourceDescriptionName ?? step.sourceDescription ?? step.source);
  if (explicit) return explicit;
  if ((step.operationId || step.operationPath) && sources.length === 1) return sources[0]?.name;
  return undefined;
}

function findMatchingSourceEntry(
  source: ArazzoSourceDescription,
  entries: readonly ArazzoSourceEntry[],
): ArazzoSourceEntry | undefined {
  return entries.find((entry) => {
    if (source.url && entry.url === source.url) return true;
    return slug(entry.displayName ?? entry.identifier) === slug(source.name);
  });
}

function normalizeDependsOn(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((entry): entry is string => typeof entry === "string");
  if (typeof value === "string") return [value];
  return [];
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function looksLikeJson(value: string): boolean {
  return value.startsWith("{") || value.startsWith("[");
}

function tryParseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}
