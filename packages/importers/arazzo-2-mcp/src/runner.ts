import { buildBody, buildUrl, type HttpExecutor } from "@quickdeployai/proxy-core/openapi";
import {
  ArazzoImportError,
  inferStepSourceName,
  type ArazzoDocument,
  type ArazzoWorkflow,
  type ArazzoWorkflowStep,
} from "./index.js";
import {
  resolveOperation,
  type ResolvedOperation,
  type SourceResolutionMap,
} from "./sources.js";
import {
  applyJsonPointer,
  evaluateRuntimeExpression,
  isRuntimeExpression,
  type RuntimeExpressionContext,
  type SourceDescriptionRef,
  type StepResponse,
  type StepResult,
} from "./runtime-expressions.js";
import { evaluateSuccessCriteria, type SuccessCriteriaObject } from "./success-criteria.js";

export class WorkflowRunError extends ArazzoImportError {}

const DEFAULT_MAX_STEPS = 200;
const DEFAULT_STEP_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_LIMIT = 1;

export type RunWorkflowOptions = {
  readonly executor: HttpExecutor;
  readonly sources: SourceResolutionMap;
  readonly maxSteps?: number;
  readonly stepTimeoutMs?: number;
  /** Overrides the OpenAPI document's `servers[0].url` for a given source name. */
  readonly baseUrls?: Readonly<Record<string, string>>;
};

export type StepRunResult = {
  stepId: string;
  status: "success" | "failure";
  attempts: number;
  outputs: Record<string, unknown>;
  response?: StepResponse;
};

export type WorkflowRunResult = {
  workflowId: string;
  outputs: Record<string, unknown>;
  steps: Record<string, StepRunResult>;
};

type ArazzoAction = {
  type: "goto" | "retry" | "end";
  stepId?: string;
  workflowId?: string;
  retryAfter?: number;
  retryLimit?: number;
  criteria?: SuccessCriteriaObject[];
};

/** Executes an Arazzo workflow: resolves each step's operation, sends the request, evaluates
 * successCriteria, and follows onSuccess/onFailure flow control until the workflow ends. */
export async function runWorkflow(
  document: ArazzoDocument,
  workflowId: string,
  inputs: Record<string, unknown>,
  options: RunWorkflowOptions,
  depth = 0,
): Promise<WorkflowRunResult> {
  if (depth > 20) {
    throw new WorkflowRunError(`Sub-workflow nesting too deep while running "${workflowId}".`);
  }

  const workflow = findWorkflow(document, workflowId);
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const stepTimeoutMs = options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  const stepsById = new Map(workflow.steps.map((step, index) => [step.stepId, index]));
  const sourceDescriptions = buildSourceDescriptionsContext(document);
  const steps: Record<string, StepResult> = {};
  const stepRunResults: Record<string, StepRunResult> = {};

  let currentIndex = 0;
  let executed = 0;

  while (currentIndex < workflow.steps.length) {
    if (executed >= maxSteps) {
      throw new WorkflowRunError(`Workflow "${workflowId}" exceeded maxSteps (${maxSteps}).`);
    }
    executed++;
    const step = workflow.steps[currentIndex]!;
    const baseContext: RuntimeExpressionContext = { inputs, steps, sourceDescriptions };

    if (isSubWorkflowStep(step)) {
      const subResult = await runWorkflow(
        document,
        step.workflowId!,
        resolveStepInputs(step, baseContext),
        options,
        depth + 1,
      );
      steps[step.stepId] = { outputs: subResult.outputs };
      stepRunResults[step.stepId] = {
        stepId: step.stepId,
        status: "success",
        attempts: 1,
        outputs: subResult.outputs,
      };
      currentIndex++;
      continue;
    }

    const { result, nextIndex, end } = await runHttpStep(
      document,
      workflow,
      step,
      baseContext,
      options,
      stepTimeoutMs,
      stepsById,
    );
    steps[step.stepId] = { outputs: result.outputs, response: result.response };
    stepRunResults[step.stepId] = result;

    if (end) break;
    currentIndex = nextIndex ?? currentIndex + 1;
  }

  const outputs = resolveExpressionMap(rawWorkflowOutputs(workflow), { inputs, steps, sourceDescriptions });
  return { workflowId, outputs, steps: stepRunResults };
}

async function runHttpStep(
  document: ArazzoDocument,
  workflow: ArazzoWorkflow,
  step: ArazzoWorkflowStep,
  baseContext: RuntimeExpressionContext,
  options: RunWorkflowOptions,
  stepTimeoutMs: number,
  stepsById: ReadonlyMap<string, number>,
): Promise<{ result: StepRunResult; nextIndex?: number; end: boolean }> {
  const sourceName = inferStepSourceName(step, document.sourceDescriptions);
  if (!sourceName) {
    throw new WorkflowRunError(`Step "${step.stepId}" has no resolvable source description.`);
  }

  let attempt = 0;
  for (;;) {
    attempt++;
    const resolved = resolveOperation(options.sources, sourceName, {
      operationId: step.operationId,
      operationPath: step.operationPath,
    });
    const baseUrl = resolveBaseUrl(options, sourceName);

    let response: StepResponse | undefined;
    try {
      response = await executeStepRequest(
        options.executor,
        buildStepRequest(resolved, baseUrl, step, baseContext),
        stepTimeoutMs,
      );
    } catch {
      // No response: treated as a failed attempt below (falls through to onFailure/retry).
      response = undefined;
    }

    const stepContext: RuntimeExpressionContext = { ...baseContext, response };
    const criteria = rawSuccessCriteria(step);
    const succeeded =
      response !== undefined &&
      (criteria.length > 0 ? evaluateSuccessCriteria(criteria, stepContext) : response.statusCode! < 400);

    const outputs = resolveExpressionMap(rawStepOutputs(step), stepContext);

    if (succeeded) {
      const action = pickAction(rawActions(step, "onSuccess") ?? rawActions(workflow, "successActions"), stepContext);
      return {
        result: { stepId: step.stepId, status: "success", attempts: attempt, outputs, response },
        end: action?.type === "end",
        nextIndex: action?.type === "goto" ? resolveGotoTarget(action, stepsById, workflow) : undefined,
      };
    }

    const action = pickAction(rawActions(step, "onFailure") ?? rawActions(workflow, "failureActions"), stepContext);
    if (action?.type === "retry") {
      const retryLimit = action.retryLimit ?? DEFAULT_RETRY_LIMIT;
      if (attempt > retryLimit) {
        throw new WorkflowRunError(
          `Step "${step.stepId}" exceeded retryLimit (${retryLimit}) without succeeding.`,
        );
      }
      if (action.retryAfter) await delay(action.retryAfter * 1000);
      continue;
    }

    if (action?.type === "end") {
      return {
        result: { stepId: step.stepId, status: "failure", attempts: attempt, outputs, response },
        end: true,
      };
    }
    if (action?.type === "goto") {
      return {
        result: { stepId: step.stepId, status: "failure", attempts: attempt, outputs, response },
        end: false,
        nextIndex: resolveGotoTarget(action, stepsById, workflow),
      };
    }

    throw new WorkflowRunError(
      `Step "${step.stepId}" failed${response ? ` (statusCode ${response.statusCode})` : ""} and no onFailure action handled it.`,
    );
  }
}

function isSubWorkflowStep(step: ArazzoWorkflowStep): boolean {
  return Boolean(step.workflowId) && !step.operationId && !step.operationPath;
}

function findWorkflow(document: ArazzoDocument, workflowId: string): ArazzoWorkflow {
  const workflow = document.workflows.find((candidate) => candidate.workflowId === workflowId);
  if (!workflow) {
    throw new WorkflowRunError(`Unknown Arazzo workflow "${workflowId}".`);
  }
  return workflow;
}

function buildSourceDescriptionsContext(
  document: ArazzoDocument,
): Record<string, SourceDescriptionRef> {
  return Object.fromEntries(
    document.sourceDescriptions.map((source) => [source.name, { url: source.url, type: source.type }]),
  );
}

function resolveBaseUrl(options: RunWorkflowOptions, sourceName: string): string {
  const override = options.baseUrls?.[sourceName];
  if (override) return override;

  const source = options.sources.get(sourceName);
  const server =
    source?.type === "openapi" ? (source.document.servers ?? [])[0]?.url : undefined;
  if (!server) {
    throw new WorkflowRunError(
      `No base URL for source "${sourceName}": pass options.baseUrls["${sourceName}"] or add a servers[] entry to the OpenAPI document.`,
    );
  }
  return server;
}

async function executeStepRequest(
  executor: HttpExecutor,
  request: { url: URL; method: string; headers: Record<string, string>; body?: unknown },
  timeoutMs: number,
): Promise<StepResponse> {
  const response = await withTimeout(executor(request), timeoutMs);
  return {
    statusCode: response.status,
    header: {},
    body: parseJsonMaybe(response.text),
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new WorkflowRunError(`Step request timed out after ${timeoutMs}ms.`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function parseJsonMaybe(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function buildStepRequest(
  resolved: ResolvedOperation,
  baseUrl: string,
  step: ArazzoWorkflowStep,
  context: RuntimeExpressionContext,
): { url: URL; method: string; headers: Record<string, string>; body?: unknown } {
  const args: Record<string, unknown> = {};
  const pathParams: string[] = [];
  const headers: Record<string, string> = {};
  const cookies: string[] = [];

  for (const parameter of rawParameters(step)) {
    const value = resolveTemplate(parameter.value, context);
    const location = parameter.in ?? operationParamIn(resolved, parameter.name) ?? "query";
    if (location === "path") {
      pathParams.push(parameter.name);
      args[parameter.name] = value;
    } else if (location === "header") {
      headers[parameter.name] = String(value);
    } else if (location === "cookie") {
      cookies.push(`${parameter.name}=${encodeURIComponent(String(value))}`);
    } else {
      args[parameter.name] = value;
    }
  }

  const requestBody = rawRequestBody(step);
  let bodyKeys: string[] = [];
  if (requestBody) {
    const payload = resolveTemplate(requestBody.payload, context);
    if (isPlainObject(payload)) {
      bodyKeys = Object.keys(payload);
      Object.assign(args, payload);
    } else if (payload !== undefined) {
      bodyKeys = ["body"];
      args.body = payload;
    }
    if (requestBody.contentType) headers["Content-Type"] = requestBody.contentType;
  }

  const url = buildUrl(baseUrl, resolved.path, args, pathParams, bodyKeys);
  const body = buildBody(bodyKeys, args);
  if (cookies.length > 0) headers.Cookie = cookies.join("; ");

  return {
    url,
    method: resolved.method.toUpperCase(),
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    ...(body !== undefined ? { body } : {}),
  };
}

function operationParamIn(resolved: ResolvedOperation, name: string): string | undefined {
  const parameters = resolved.operation.parameters as
    | Array<{ name?: string; in?: string }>
    | undefined;
  return parameters?.find((parameter) => parameter.name === name)?.in;
}

function resolveTemplate(value: unknown, context: RuntimeExpressionContext): unknown {
  if (typeof value === "string") {
    return isRuntimeExpression(value) ? evaluateRuntimeExpression(value, context) : value;
  }
  if (Array.isArray(value)) return value.map((item) => resolveTemplate(item, context));
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveTemplate(item, context)]),
    );
  }
  return value;
}

function resolveExpressionMap(
  raw: Record<string, unknown> | undefined,
  context: RuntimeExpressionContext,
): Record<string, unknown> {
  if (!raw) return {};
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, resolveTemplate(value, context)]),
  );
}

function resolveStepInputs(
  step: ArazzoWorkflowStep,
  context: RuntimeExpressionContext,
): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const parameter of rawParameters(step)) raw[parameter.name] = parameter.value;
  return resolveExpressionMap(raw, context);
}

function pickAction(
  actions: ArazzoAction[] | undefined,
  context: RuntimeExpressionContext,
): ArazzoAction | undefined {
  if (!actions) return undefined;
  return actions.find(
    (action) => !action.criteria || evaluateSuccessCriteria(action.criteria, context),
  );
}

function resolveGotoTarget(
  action: ArazzoAction,
  stepsById: ReadonlyMap<string, number>,
  workflow: ArazzoWorkflow,
): number {
  if (!action.stepId) {
    throw new WorkflowRunError(`A "goto" action in workflow "${workflow.workflowId}" is missing stepId.`);
  }
  const index = stepsById.get(action.stepId);
  if (index === undefined) {
    throw new WorkflowRunError(
      `"goto" action targets unknown stepId "${action.stepId}" in workflow "${workflow.workflowId}".`,
    );
  }
  return index;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type RawParameter = { name: string; in?: string; value: unknown };

function rawParameters(step: ArazzoWorkflowStep): RawParameter[] {
  const value = (step as Record<string, unknown>).parameters;
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => isPlainObject(item) && typeof item.name === "string")
    .map((item) => ({
      name: item.name as string,
      in: typeof item.in === "string" ? item.in : undefined,
      value: item.value,
    }));
}

function rawRequestBody(step: ArazzoWorkflowStep): { contentType?: string; payload?: unknown } | undefined {
  const value = (step as Record<string, unknown>).requestBody;
  if (!isPlainObject(value)) return undefined;
  return {
    contentType: typeof value.contentType === "string" ? value.contentType : undefined,
    payload: value.payload,
  };
}

function rawStepOutputs(step: ArazzoWorkflowStep): Record<string, unknown> | undefined {
  const value = (step as Record<string, unknown>).outputs;
  return isPlainObject(value) ? value : undefined;
}

function rawWorkflowOutputs(workflow: ArazzoWorkflow): Record<string, unknown> | undefined {
  const value = (workflow as unknown as Record<string, unknown>).outputs;
  return isPlainObject(value) ? value : undefined;
}

function rawSuccessCriteria(step: ArazzoWorkflowStep): SuccessCriteriaObject[] {
  const value = step.successCriteria;
  return Array.isArray(value) ? (value as unknown as SuccessCriteriaObject[]) : [];
}

function rawActions(
  owner: ArazzoWorkflowStep | ArazzoWorkflow,
  key: "onSuccess" | "onFailure" | "successActions" | "failureActions",
): ArazzoAction[] | undefined {
  const value = (owner as unknown as Record<string, unknown>)[key];
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value
    .filter((item): item is Record<string, unknown> => isPlainObject(item) && typeof item.type === "string")
    .map((item) => ({
      type: item.type as ArazzoAction["type"],
      stepId: typeof item.stepId === "string" ? item.stepId : undefined,
      workflowId: typeof item.workflowId === "string" ? item.workflowId : undefined,
      retryAfter: typeof item.retryAfter === "number" ? item.retryAfter : undefined,
      retryLimit: typeof item.retryLimit === "number" ? item.retryLimit : undefined,
      criteria: Array.isArray(item.criteria)
        ? (item.criteria as unknown as SuccessCriteriaObject[])
        : undefined,
    }));
}

// Re-exported for convenience so consumers don't need a separate import for the pointer helper.
export { applyJsonPointer };
