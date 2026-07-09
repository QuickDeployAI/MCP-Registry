/**
 * Source adapters — resolve a manifest `spec.source` (local directory, git
 * URL, or agent-skills registry index URL) into a local path that
 * `loadSkillCatalog` can read, with etag/commit-sha cache invalidation so
 * repeated resolves avoid redundant network calls.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SkillSourceSpec =
  | { readonly type: "file"; readonly uri: string }
  | { readonly type: "git"; readonly uri: string; readonly ref: string }
  | { readonly type: "http"; readonly uri: string };

export interface GitCommandRunner {
  (
    args: readonly string[],
    options: { readonly cwd?: string },
  ): Promise<{ readonly stdout: string }>;
}

export interface HttpFetchResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface HttpFetcher {
  (url: string, init?: { readonly headers?: Record<string, string> }): Promise<HttpFetchResponse>;
}

export interface ResolveSkillSourceOptions {
  readonly cacheDir?: string;
  readonly gitRunner?: GitCommandRunner;
  readonly fetcher?: HttpFetcher;
}

export interface ResolvedSkillSource {
  /** Local directory (or registry-index JSON file) ready for loadSkillCatalog. */
  readonly path: string;
  /** True if new content was fetched/cloned during this resolve call. */
  readonly refreshed: boolean;
  /** Commit SHA (git) or ETag (http) the resolution settled on, when known. */
  readonly resolvedRef?: string;
}

interface RegistryIndexEntry {
  readonly skill?: string;
  readonly summary?: string;
  readonly canonical_url?: string;
}

interface RegistryIndexDocument {
  readonly agents?: readonly RegistryIndexEntry[];
}

interface HttpSourceCacheMeta {
  readonly etag?: string;
  readonly body: string;
  readonly updatedAt: string;
}

interface GitSourceCacheMeta {
  readonly uri: string;
  readonly ref: string;
  readonly resolvedRef: string;
  readonly updatedAt: string;
}

const IMMUTABLE_COMMIT_SHA = /^[a-f0-9]{40}$/i;

function defaultCacheDir(): string {
  return path.join(os.tmpdir(), "quickdeploy-agent-skills-2-mcp-cache");
}

function cacheKey(uri: string): string {
  return createHash("sha256").update(uri).digest("hex").slice(0, 32);
}

async function defaultGitRunner(
  args: readonly string[],
  options: { readonly cwd?: string },
): Promise<{ readonly stdout: string }> {
  const result = await execFileAsync("git", [...args], { cwd: options.cwd });
  return { stdout: result.stdout };
}

async function defaultFetcher(
  url: string,
  init?: { readonly headers?: Record<string, string> },
): Promise<HttpFetchResponse> {
  return fetch(url, { headers: init?.headers });
}

async function readJsonSafely<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
  } catch {
    return undefined;
  }
}

/** Parses a bare CLI/manifest source string into a typed source spec. */
export function parseSkillSourceArg(raw: string, ref?: string): SkillSourceSpec {
  if (raw.startsWith("git+https://") || raw.startsWith("git+ssh://")) {
    return { type: "git", uri: raw, ref: ref && ref.trim() ? ref : "HEAD" };
  }
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return { type: "http", uri: raw };
  }
  if (raw.startsWith("file://")) {
    return { type: "file", uri: raw };
  }
  return { type: "file", uri: `file://${path.resolve(raw)}` };
}

export async function resolveSkillSource(
  spec: SkillSourceSpec,
  options: ResolveSkillSourceOptions = {},
): Promise<ResolvedSkillSource> {
  if (spec.type === "file") {
    const resolvedPath = spec.uri.startsWith("file://") ? fileURLToPath(spec.uri) : spec.uri;
    await fs.access(resolvedPath);
    return { path: resolvedPath, refreshed: false };
  }

  if (spec.type === "git") {
    return resolveGitSource(spec, options);
  }

  return resolveHttpRegistrySource(spec, options);
}

async function resolveGitSource(
  spec: { readonly uri: string; readonly ref: string },
  options: ResolveSkillSourceOptions,
): Promise<ResolvedSkillSource> {
  const gitRunner = options.gitRunner ?? defaultGitRunner;
  const cacheDir = options.cacheDir ?? defaultCacheDir();
  const key = cacheKey(spec.uri);
  const checkoutDir = path.join(cacheDir, key);
  const metaPath = path.join(cacheDir, `${key}.git.json`);
  const meta = await readJsonSafely<GitSourceCacheMeta>(metaPath);

  const pinnedSha = IMMUTABLE_COMMIT_SHA.test(spec.ref) ? spec.ref.toLowerCase() : undefined;
  const targetRef = pinnedSha ?? (await resolveRemoteRef(gitRunner, spec.uri, spec.ref));

  if (meta && meta.resolvedRef === targetRef && (await pathExists(checkoutDir))) {
    return { path: checkoutDir, refreshed: false, resolvedRef: targetRef };
  }

  await fs.rm(checkoutDir, { recursive: true, force: true });
  await fs.mkdir(checkoutDir, { recursive: true });
  await gitRunner(["init", "--quiet"], { cwd: checkoutDir });
  await gitRunner(["remote", "add", "origin", spec.uri], { cwd: checkoutDir });
  await gitRunner(["fetch", "--quiet", "--depth", "1", "origin", spec.ref], { cwd: checkoutDir });
  await gitRunner(["checkout", "--quiet", "FETCH_HEAD"], { cwd: checkoutDir });
  const resolvedRef = (await gitRunner(["rev-parse", "HEAD"], { cwd: checkoutDir })).stdout.trim();

  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(
    metaPath,
    JSON.stringify(
      { uri: spec.uri, ref: spec.ref, resolvedRef, updatedAt: new Date().toISOString() },
      null,
      2,
    ),
  );

  return { path: checkoutDir, refreshed: true, resolvedRef };
}

async function resolveRemoteRef(
  gitRunner: GitCommandRunner,
  uri: string,
  ref: string,
): Promise<string> {
  const { stdout } = await gitRunner(["ls-remote", uri, ref], {});
  const firstLine = stdout.split("\n").find((line) => line.trim().length > 0);
  const sha = firstLine?.split(/\s+/)[0];
  if (!sha) {
    throw new Error(`git ls-remote could not resolve ref "${ref}" on ${uri}`);
  }
  return sha;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveHttpRegistrySource(
  spec: { readonly uri: string },
  options: ResolveSkillSourceOptions,
): Promise<ResolvedSkillSource> {
  const fetcher = options.fetcher ?? defaultFetcher;
  const cacheDir = options.cacheDir ?? defaultCacheDir();
  const key = cacheKey(spec.uri);
  const metaPath = path.join(cacheDir, `${key}.http.json`);
  const skillsRoot = path.join(cacheDir, `${key}-skills`);
  const meta = await readJsonSafely<HttpSourceCacheMeta>(metaPath);

  const response = await fetcher(
    spec.uri,
    meta?.etag ? { headers: { "if-none-match": meta.etag } } : undefined,
  );

  let refreshed = false;
  let body: string;
  if (response.status === 304 && meta) {
    body = meta.body;
  } else {
    if (response.status !== 200) {
      throw new Error(
        `Failed to fetch agent-skills registry index ${spec.uri}: HTTP ${response.status}`,
      );
    }
    body = await response.text();
    refreshed = true;
  }

  const etag = response.headers.get("etag") ?? meta?.etag;

  if (refreshed) {
    const registry = JSON.parse(body) as RegistryIndexDocument;
    await fs.rm(skillsRoot, { recursive: true, force: true });
    await fs.mkdir(skillsRoot, { recursive: true });

    let index = 0;
    for (const agent of registry.agents ?? []) {
      index += 1;
      if (!agent.skill) continue;

      // Only the SKILL.md entrypoint is fetchable this way — plain HTTP has
      // no directory listing, so scripts/references/assets are unavailable
      // for registry-index sources (git and local-dir sources carry them).
      const skillUrl = new URL(agent.skill, agent.canonical_url ?? spec.uri).toString();
      const skillResponse = await fetcher(skillUrl);
      if (skillResponse.status !== 200) continue;

      const skillDir = path.join(skillsRoot, `agent-${index}`);
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, "SKILL.md"), await skillResponse.text(), "utf-8");
    }

    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(
      metaPath,
      JSON.stringify({ etag, body, updatedAt: new Date().toISOString() }, null, 2),
    );
  }

  return { path: skillsRoot, refreshed, resolvedRef: etag };
}
