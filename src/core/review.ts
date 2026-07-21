export type ReviewTarget =
  | {
      kind: "file" | "directory" | "commit" | "range" | "branch" | "pr";
      value: string;
    }
  | { kind: "dirty" }
  | { kind: "merge-base"; value: string }
  | { kind: "required" };

export interface ReviewContext {
  dirty: boolean;
  currentBranch?: string;
  defaultBranch?: string;
}

export function selectReviewTarget(
  explicit: ReviewTarget | undefined,
  context: ReviewContext,
): ReviewTarget {
  if (explicit) return explicit;
  if (context.dirty) return { kind: "dirty" };
  if (
    context.currentBranch &&
    context.defaultBranch &&
    context.currentBranch !== context.defaultBranch
  ) {
    return { kind: "merge-base", value: context.defaultBranch };
  }
  return { kind: "required" };
}

export interface Finding {
  severity: "critical" | "high" | "medium" | "low";
  location: string;
  confidence: "high" | "medium" | "low";
  evidence: string;
  impact: string;
  remediation: string;
}

const severityOrder: Record<Finding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function normalizeFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (left, right) =>
      severityOrder[left.severity] - severityOrder[right.severity],
  );
}
