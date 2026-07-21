import { describe, expect, it } from "vitest";

import { RunMachine, WriterLeases } from "../src/core/state.js";
import { createRun } from "../src/core/types.js";

describe("run state seam", () => {
  it("enforces legal phases and terminal idempotency", () => {
    const machine = new RunMachine(
      createRun("run-1", "implement", "task", 100),
    );

    machine.startPhase("implementing", 101);
    machine.finishPhase("succeeded", 102);
    machine.finish("succeeded", 103);
    machine.finish("succeeded", 104);

    expect(machine.record.status).toBe("succeeded");
    expect(machine.record.updatedAt).toBe(103);
    expect(() => machine.startPhase("verifying", 105)).toThrow(/terminal run/);
  });

  it("allows only one writer for a worktree", async () => {
    const leases = new WriterLeases();
    const first = leases.acquire("/work", "run-1");

    expect(() => leases.acquire("/work", "run-2")).toThrow(/already held/);
    first.release();
    expect(leases.acquire("/work", "run-2").owner).toBe("run-2");
  });

  it("cancels once and records interruption without rolling back", () => {
    const machine = new RunMachine(createRun("run-1", "research", "task", 100));
    machine.startPhase("researching", 101);
    machine.interrupt(102, "host restarted");

    expect(machine.record).toMatchObject({
      status: "interrupted",
      recovery: ["resume", "restart-phase", "abandon"],
    });
  });
});
