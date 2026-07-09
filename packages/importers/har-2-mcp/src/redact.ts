import type { HarCookie, HarHeader, HarQueryParam } from "./types";

export type RedactionLocation = "header" | "query" | "cookie";

export type RedactionFinding = {
  location: RedactionLocation;
  name: string;
  method: string;
  url: string;
  reason: string;
  sample: string;
};

export type RedactionReport = {
  generatedAt: string;
  source: "har-capture";
  findings: RedactionFinding[];
};

/**
 * Header/query/cookie names that are treated as sensitive by name alone.
 * Matches "authorization", "api-key"/"api_key"/"apikey", "token", "secret",
 * "session" (as in session_id, sessionid), and other "auth*" names.
 */
const SENSITIVE_NAME_PATTERN = /api[-_]?key|token|secret|session|auth/i;

/** Header/cookie/query values that look like a bearer credential regardless of the field name. */
const BEARER_VALUE_PATTERN = /^Bearer\s+\S+/i;

/** Header/cookie/query values shaped like a JWT (three dot-separated base64url segments). */
const JWT_LIKE_PATTERN = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;

export function findHeaderRedactions(
  method: string,
  url: string,
  headers: readonly HarHeader[],
): RedactionFinding[] {
  return headers.flatMap((header) => {
    const reason = classify(header.name, header.value);
    return reason
      ? [
          {
            location: "header" as const,
            name: header.name,
            method,
            url,
            reason,
            sample: maskValue(header.value),
          },
        ]
      : [];
  });
}

export function findQueryRedactions(
  method: string,
  url: string,
  params: readonly HarQueryParam[],
): RedactionFinding[] {
  return params.flatMap((param) => {
    const reason = classify(param.name, param.value);
    return reason
      ? [
          {
            location: "query" as const,
            name: param.name,
            method,
            url,
            reason,
            sample: maskValue(param.value),
          },
        ]
      : [];
  });
}

export function findCookieRedactions(
  method: string,
  url: string,
  cookies: readonly HarCookie[],
): RedactionFinding[] {
  return cookies.flatMap((cookie) => {
    const reason = classify(cookie.name, cookie.value);
    return reason
      ? [
          {
            location: "cookie" as const,
            name: cookie.name,
            method,
            url,
            reason,
            sample: maskValue(cookie.value),
          },
        ]
      : [];
  });
}

function classify(name: string, value: string): string | undefined {
  if (name.toLowerCase() === "authorization") return "authorization-header";
  if (SENSITIVE_NAME_PATTERN.test(name)) return "sensitive-name-pattern";
  if (BEARER_VALUE_PATTERN.test(value)) return "bearer-token-value";
  if (JWT_LIKE_PATTERN.test(value)) return "jwt-like-value";
  return undefined;
}

export function maskValue(value: string): string {
  if (value.length <= 6) return "*".repeat(value.length);
  return `${value.slice(0, 4)}${"*".repeat(value.length - 4)}`;
}

/** Deterministic env var name a reviewer/operator must supply once a finding is redacted out of the spec. */
export function envKeyFor(location: RedactionLocation, name: string): string {
  const normalized = name.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
  return `HAR_${location.toUpperCase()}_${normalized}`;
}
