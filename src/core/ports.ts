import type { ManagerConfig } from "./config.js";
import type {
  CatalogModel,
  HostPermissions,
  ManagerEvent,
  ModelPair,
  PhaseName,
  Profile,
  RunRecord,
  Workflow,
} from "./types.js";

export interface MinionRequest {
  runID: string;
  phase: PhaseName;
  task: string;
  profile: Profile;
  pair: ModelPair;
  parentSessionID: string;
  mode: "read" | "write";
  reportDestination?: string;
  resumeSessionID?: string;
}

export interface MinionResult {
  sessionID: string;
  output: string;
  blocking: boolean;
  usage?: { inputTokens?: number; outputTokens?: number; cost?: number };
}

export interface SessionPort {
  run(
    request: MinionRequest,
    signal: AbortSignal,
    onSession: (sessionID: string) => void,
  ): Promise<MinionResult>;
  interrupt(sessionID: string): Promise<void>;
}

export interface RunStorage {
  list(): Promise<RunRecord[]>;
  save(record: RunRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ApprovalRequest {
  runID: string;
  nextPhase: string;
  profile: Profile;
  pair?: ModelPair;
  reason: string;
  budgetEffect: string;
}

export interface ManagerPorts {
  catalog(): Promise<CatalogModel[]>;
  permissions(): Promise<HostPermissions>;
  sessions: SessionPort;
  storage: RunStorage;
  approve(request: ApprovalRequest): Promise<boolean>;
  emit(event: ManagerEvent): void;
  now(): number;
  id(): string;
  worktree: string;
  config: ManagerConfig;
}

export interface RunInput {
  task: string;
  parentSessionID: string;
}

export interface WorkflowResult {
  runID: string;
  workflow: Workflow;
  status: RunRecord["status"];
  outputs: string[];
  errors: string[];
  record: RunRecord;
}
