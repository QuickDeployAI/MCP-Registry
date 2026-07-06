import { buildBody, buildUrl } from "./request.js";

export type ProxyExecuteContext = {
  method: string;
  path: string;
  pathParams: readonly string[];
  bodyKeys: readonly string[];
  args: Record<string, unknown>;
};

export type ProxyExecutor = (context: ProxyExecuteContext) => Promise<string>;

export function createHttpExecutor(baseUrl: string): ProxyExecutor {
  return async ({ method, path, pathParams, bodyKeys, args }) => {
    const url = buildUrl(baseUrl, path, args, pathParams, bodyKeys);
    const body = buildBody(bodyKeys, args);
    const res = await fetch(url, {
      method: method.toUpperCase(),
      headers: { "Content-Type": "application/json", Accept: "application/json" },
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
