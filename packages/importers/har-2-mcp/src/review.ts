import type { RedactionReport } from "./redact";
import type { OpenApiDocument } from "./types";

export class HarReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarReviewError";
  }
}

export type ReviewHarDraftOptions = {
  draft: OpenApiDocument;
  redactionReport: RedactionReport;
  /** Must be explicitly `true` — a human/reviewer has checked the redaction report and accepts it. */
  accept: boolean;
};

/**
 * The gate between a HAR-derived draft spec and anything that can serve traffic.
 *
 * A draft produced by `convertHarToOpenApi` is never runnable on its own: it carries
 * `x-quickdeploy-har-review.status === "draft"`. This function is the only supported
 * way to flip that status to `"reviewed"`, and it refuses to do so unless the caller
 * passes `accept: true` for the exact redaction report that was generated alongside
 * the draft (matched by finding count). That keeps a captured secret from ever
 * reaching `buildHarMcpTools` without a human explicitly signing off on it first.
 */
export function reviewHarDraft(options: ReviewHarDraftOptions): OpenApiDocument {
  const { draft, redactionReport, accept } = options;

  if (draft["x-quickdeploy-har-review"]?.status !== "draft") {
    throw new HarReviewError(
      'Only a draft spec produced by convertHarToOpenApi (status "draft") can be reviewed.',
    );
  }
  if (!accept) {
    throw new HarReviewError(
      "Reviewer must explicitly accept the redaction report before a HAR-derived spec can be " +
        "marked reviewed. Re-run with --accept once the flagged headers/tokens/cookies have been checked.",
    );
  }
  if (redactionReport.findings.length !== draft["x-quickdeploy-har-review"].redactionFindingCount) {
    throw new HarReviewError(
      "Redaction report does not match the draft spec it was generated with " +
        `(expected ${draft["x-quickdeploy-har-review"].redactionFindingCount} finding(s), got ${redactionReport.findings.length}). ` +
        "Re-run `har-2-mcp convert` to regenerate a matching pair.",
    );
  }

  return {
    ...draft,
    "x-quickdeploy-har-review": {
      status: "reviewed",
      redactionFindingCount: redactionReport.findings.length,
      reviewedAt: new Date().toISOString(),
    },
  };
}
