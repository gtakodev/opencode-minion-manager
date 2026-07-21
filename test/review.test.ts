import { describe, expect, it } from "vitest";

import { normalizeFindings, selectReviewTarget } from "../src/core/review.js";

describe("review scope seam", () => {
  it("uses explicit, dirty, merge-base, then required precedence", () => {
    const explicit = { kind: "file" as const, value: "src/app.ts" };
    expect(selectReviewTarget(explicit, { dirty: true })).toBe(explicit);
    expect(selectReviewTarget(undefined, { dirty: true })).toEqual({
      kind: "dirty",
    });
    expect(
      selectReviewTarget(undefined, {
        dirty: false,
        currentBranch: "feature",
        defaultBranch: "main",
      }),
    ).toEqual({ kind: "merge-base", value: "main" });
    expect(
      selectReviewTarget(undefined, {
        dirty: false,
        currentBranch: "main",
        defaultBranch: "main",
      }),
    ).toEqual({ kind: "required" });
  });

  it("orders findings severity-first", () => {
    const base = {
      location: "a.ts:1",
      confidence: "high" as const,
      evidence: "e",
      impact: "i",
      remediation: "r",
    };
    expect(
      normalizeFindings([
        { ...base, severity: "low" },
        { ...base, severity: "critical" },
      ]).map((finding) => finding.severity),
    ).toEqual(["critical", "low"]);
  });
});
