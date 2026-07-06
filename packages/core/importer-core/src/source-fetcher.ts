import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface FetchSourceOptions {
  readonly timeoutMs?: number;
  readonly userAgent?: string;
  readonly cwd?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_USER_AGENT = "quickdeploy-importer-core/0.1";

export async function fetchTextSource(
  source: string,
  options: FetchSourceOptions = {},
): Promise<string> {
  const bytes = await fetchBytesSource(source, options);
  return new TextDecoder().decode(bytes);
}

export async function fetchBytesSource(
  source: string,
  options: FetchSourceOptions = {},
): Promise<Uint8Array> {
  const trimmed = source.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return fetchHttp(trimmed, options);
  }

  const path = trimmed.startsWith("file://")
    ? fileURLToPath(trimmed)
    : isAbsolute(trimmed)
      ? trimmed
      : resolve(options.cwd ?? process.cwd(), trimmed);

  return readFile(path);
}

async function fetchHttp(
  url: string,
  options: FetchSourceOptions,
): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": options.userAgent ?? DEFAULT_USER_AGENT,
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}
