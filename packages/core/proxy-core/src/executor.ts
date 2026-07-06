import { buildBody, buildUrl } from "./request.js";

export type ProxyExecuteContext = {
  method: string;
  path: string;
  pathParams: readonly string[];
  headerKeys: readonly string[];
  bodyKeys: readonly string[];
  args: Record<string, unknown>;
};

export type ProxyExecutor = (context: ProxyExecuteContext) => Promise<string>;

export type ProxyRequestAugmentation = {
  readonly headers?: Record<string, string>;
  readonly query?: Record<string, string>;
};

export type ProxyRequestAugmenter = (
  context: ProxyExecuteContext,
) => ProxyRequestAugmentation | Promise<ProxyRequestAugmentation>;

export type HttpExecutorOptions = {
  readonly augmentRequest?: ProxyRequestAugmenter;
};

export function createHttpExecutor(
  baseUrl: string,
  options: HttpExecutorOptions = {},
): ProxyExecutor {
  return async (context) => {
    const { method, path, pathParams, headerKeys, bodyKeys, args } = context;
    const url = buildUrl(baseUrl, path, args, pathParams, bodyKeys, headerKeys);
    const body = buildBody(bodyKeys, args);
    const augmentation = await options.augmentRequest?.(context);
    for (const [name, value] of Object.entries(augmentation?.query ?? {})) {
      url.searchParams.set(name, value);
    }
    const res = await fetch(url, {
      method: method.toUpperCase(),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...augmentation?.headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  };
}
