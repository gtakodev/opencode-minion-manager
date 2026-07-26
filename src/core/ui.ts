import type { Profile, RunStatus, Workflow } from "./types.js";

export const MANAGER_UI_COPY = {
  pickerTitle: "Select workflow",
  pickerDescription:
    "Manager orchestrates specialized Minions using native OpenCode child sessions.",
  pickerHint: "←/→ navigate · enter select · esc cancel",
} as const;

export const PICKER_OPTIONS = [
  {
    value: "auto",
    label: "Auto",
    icon: "▣",
    frames: ["▣", "▤", "▥"],
    tone: "info",
    sprite: ["  ▄█▄  ", "▄█████▄", "█ ▄ ▄ █", "█ ███ █", "▀█████▀"],
    description: "Let Manager choose the best workflow.",
  },
  {
    value: "implement",
    label: "Implement",
    icon: "◆",
    frames: ["◆", "◇", "◆"],
    tone: "success",
    sprite: ["     ▄█", " ▄  ██ ", "  ███  ", " ██  ▄ ", "█▄     "],
    description: "Make a change, verify it, and request an independent review.",
  },
  {
    value: "review",
    label: "Review",
    icon: "◉",
    frames: ["◉", "◍", "◎"],
    tone: "accent",
    sprite: [" ▄███▄ ", "██   ██", "██   ██", " ▀███▀ ", "    ▀█▄"],
    description: "Inspect changes and report findings without editing.",
  },
  {
    value: "research",
    label: "Research",
    icon: "▥",
    frames: ["▥", "▤", "▥"],
    tone: "warning",
    sprite: ["▄██ ▄██", "█ █ █ █", "█ █ █ █", "█ █ █ █", "▀██ ▀██"],
    description: "Investigate and synthesize evidence and options.",
  },
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
  const option = PICKER_OPTIONS.find(
    (option) => option.value === status.workflow,
  );
  const icon = option?.icon ?? "◆";
  const label = option?.label ?? status.workflow;
  const narrow = `${icon} ${label} · ${status.state}`;
  const compact = `${icon} Manager › ${label} · ${status.state}`;
  if (status.state === "ready" || !status.profile)
    return fits(compact, width) ? compact : narrow;
  const progress =
    status.step !== undefined && status.total !== undefined
      ? `${status.step}/${status.total}`
      : status.state;
  const medium = `${icon} Manager › ${label} · ${progress} · ${status.profile}`;
  const full = `${medium} · ${status.model}${status.variant ? `#${status.variant}` : ""}`;
  if (status.model && fits(full, width)) return full;
  if (fits(medium, width)) return medium;
  if (fits(compact, width)) return compact;
  return narrow;
}

function fits(value: string, width: number): boolean {
  return [...value].length <= width;
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
