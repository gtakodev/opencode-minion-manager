import {
  TERMINAL_STATUSES,
  type PhaseName,
  type RunRecord,
  type TerminalStatus,
} from "./types.js";

export class RunMachine {
  readonly record: RunRecord;

  constructor(record: RunRecord) {
    this.record = structuredClone(record);
  }

  startPhase(name: PhaseName, at: number): void {
    this.assertMutable();
    this.record.status = "running";
    this.record.phases.push({ name, status: "active", startedAt: at });
    this.record.updatedAt = at;
  }

  finishPhase(
    status: "succeeded" | "failed" | "cancelled",
    at: number,
    result?: string,
    name?: PhaseName,
  ): void {
    this.assertMutable();
    const active = this.record.phases.findLast(
      (phase) =>
        phase.status === "active" &&
        (name === undefined || phase.name === name),
    );
    if (!active) throw new Error("Cannot finish a phase when none is active.");
    active.status = status;
    active.finishedAt = at;
    if (result !== undefined) active.result = result;
    this.record.updatedAt = at;
  }

  finish(status: TerminalStatus, at: number): void {
    if (TERMINAL_STATUSES.includes(this.record.status as TerminalStatus)) {
      if (this.record.status === status) return;
      throw new Error(
        `Cannot change terminal run ${this.record.id} from ${this.record.status} to ${status}.`,
      );
    }
    this.record.status = status;
    this.record.updatedAt = at;
  }

  wait(at: number, decision: string): void {
    this.assertMutable();
    this.record.status = "waiting";
    this.record.decisions.push(decision);
    this.record.updatedAt = at;
  }

  resume(at: number): void {
    if (
      this.record.status !== "waiting" &&
      this.record.status !== "interrupted"
    ) {
      throw new Error(
        `Run ${this.record.id} is not resumable from ${this.record.status}.`,
      );
    }
    this.record.status = "running";
    delete this.record.recovery;
    this.record.updatedAt = at;
  }

  interrupt(at: number, reason: string): void {
    if (TERMINAL_STATUSES.includes(this.record.status as TerminalStatus))
      return;
    const active = this.record.phases.findLast(
      (phase) => phase.status === "active",
    );
    if (active) {
      active.status = "interrupted";
      active.finishedAt = at;
      active.error = reason;
    }
    this.record.status = "interrupted";
    this.record.errors.push(reason);
    this.record.recovery = ["resume", "restart-phase", "abandon"];
    this.record.updatedAt = at;
  }

  private assertMutable(): void {
    if (TERMINAL_STATUSES.includes(this.record.status as TerminalStatus)) {
      throw new Error(`Cannot mutate terminal run ${this.record.id}.`);
    }
  }
}

export interface WriterLease {
  owner: string;
  release(): void;
}

export class WriterLeases {
  private readonly owners = new Map<string, string>();

  acquire(worktree: string, owner: string): WriterLease {
    const current = this.owners.get(worktree);
    if (current)
      throw new Error(
        `Writer lease for ${worktree} is already held by ${current}.`,
      );
    this.owners.set(worktree, owner);
    let released = false;
    return {
      owner,
      release: () => {
        if (!released && this.owners.get(worktree) === owner)
          this.owners.delete(worktree);
        released = true;
      },
    };
  }
}
