import { EngineResolutionError } from "./errors";

type Version = {
  major: number;
  minor: number;
  patch: number;
};

export function assertVersionSatisfies(engineName: string, actual: string, range: string): void {
  if (satisfies(actual, range)) return;
  throw new EngineResolutionError(
    `Importer ${engineName}@${actual} does not satisfy manifest range ${range}.`,
  );
}

export function satisfies(actual: string, range: string): boolean {
  const trimmed = range.trim();
  if (trimmed === "*" || trimmed === "") return true;
  const parsedActual = parseVersion(actual);

  if (trimmed.startsWith("^")) {
    const lower = parseVersion(trimmed.slice(1));
    return parsedActual.major === lower.major && compareVersions(parsedActual, lower) >= 0;
  }

  if (trimmed.startsWith(">=")) {
    return compareVersions(parsedActual, parseVersion(trimmed.slice(2))) >= 0;
  }

  return compareVersions(parsedActual, parseVersion(trimmed)) === 0;
}

function parseVersion(input: string): Version {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/.exec(input.trim());
  if (!match) throw new EngineResolutionError(`Invalid semver value: ${input}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}
