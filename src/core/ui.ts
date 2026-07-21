import type { Profile, RunStatus, Workflow } from "./types.js";

export const PICKER_OPTIONS = [
  { value: "auto", label: "Auto", icon: "◈" },
  { value: "implement", label: "Implement", icon: "▣" },
  { value: "review", label: "Review", icon: "◇" },
  { value: "research", label: "Research", icon: "◫" },
] as const;

export interface StatusBand {
  state: "ready" | "working" | "waiting" | "success" | "error";
  workflow: Workflow;
  step?: number;
  total?: number;
  profile?: Profile;
  model?: string;
  variant?: string;
}

export function formatStatusBand(status: StatusBand, width: number): string {
  const compact = `◈ ${status.workflow} · ${status.state}`;
  if (width < 36 || status.state === "ready" || !status.profile) return compact;
  const progress =
    status.step !== undefined && status.total !== undefined
      ? `${status.step}/${status.total}`
      : status.state;
  const medium = `◈ ${status.workflow} · ${progress} · ${status.profile}`;
  if (width < 58 || !status.model) return medium;
  return `${medium} · ${status.model}${status.variant ? `#${status.variant}` : ""}`;
}

export function stateColor(
  status: RunStatus,
): "accent" | "warning" | "success" | "error" {
  if (status === "waiting" || status === "interrupted") return "warning";
  if (status === "succeeded") return "success";
  if (["failed", "cancelled", "abandoned", "partial"].includes(status))
    return "error";
  return "accent";
}
