export const WORKFLOWS = ["auto", "implement", "review", "research"] as const;
export type Workflow = (typeof WORKFLOWS)[number];

export const PROFILES = [
  "minion/plan",
  "minion/implement",
  "minion/review",
  "minion/research",
  "minion/verify",
  "minion/report",
] as const;
export type Profile = (typeof PROFILES)[number];

export type RunStatus =
  | "pending"
  | "running"
  | "waiting"
  | "interrupted"
  | "succeeded"
  | "partial"
  | "failed"
  | "cancelled"
  | "abandoned";

export const TERMINAL_STATUSES = [
  "succeeded",
  "partial",
  "failed",
  "cancelled",
  "abandoned",
] as const;
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export type PhaseName =
  | "planning"
  | "implementing"
  | "verifying"
  | "reviewing"
  | "researching"
  | "reporting";
export type PhaseStatus =
  | "active"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface ModelPair {
  providerID: string;
  modelID: string;
  variant?: string;
}

export interface ModelDecision {
  pair: ModelPair;
  reason: string;
  fallback: boolean;
  cost?: number;
}

export interface PhaseRecord {
  name: PhaseName;
  status: PhaseStatus;
  startedAt: number;
  finishedAt?: number;
  profile?: Profile;
  model?: ModelDecision;
  childSessionID?: string;
  result?: string;
  error?: string;
}

export interface RunRecord {
  schemaVersion: 1;
  id: string;
  workflow: Workflow;
  task: string;
  managerSessionID?: string;
  status: RunStatus;
  phases: PhaseRecord[];
  decisions: string[];
  errors: string[];
  correctionCount: number;
  createdAt: number;
  updatedAt: number;
  recovery?: readonly ["resume", "restart-phase", "abandon"];
  usage?: { inputTokens?: number; outputTokens?: number; cost?: number };
}

export interface CatalogModel {
  providerID: string;
  modelID: string;
  variants: string[];
  capabilities: string[];
  contextLimit?: number;
  outputLimit?: number;
  cost?: number;
}

export interface HostPermissions {
  read: boolean;
  web: boolean;
  shell: boolean;
  edit: boolean;
}

export interface ManagerEvent {
  type:
    | "run.started"
    | "phase.started"
    | "phase.finished"
    | "run.waiting"
    | "routing.fallback"
    | "run.finished"
    | "run.error";
  runID: string;
  at: number;
  workflow: Workflow;
  phase?: PhaseName;
  profile?: Profile;
  status?: RunStatus;
  message?: string;
  model?: ModelPair;
}

export function createRun(
  id: string,
  workflow: Workflow,
  task: string,
  now: number,
): RunRecord {
  return {
    schemaVersion: 1,
    id,
    workflow,
    task,
    status: "pending",
    phases: [],
    decisions: [],
    errors: [],
    correctionCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}
