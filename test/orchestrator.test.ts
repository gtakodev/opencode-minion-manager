import { describe, expect, it } from "vitest";

import { MinionManager } from "../src/core/orchestrator.js";
import { memoryHarness } from "./support/harness.js";

describe("headless orchestration seam", () => {
  it("delegates two readers to independent exact model pairs", async () => {
    const harness = memoryHarness();
    const manager = new MinionManager(harness.ports);

    const result = await manager.research({
      task: "Compare storage and routing",
      parentSessionID: "parent",
      inquiries: [
        {
          task: "Inspect storage",
          pair: { providerID: "alpha", modelID: "fast", variant: "low" },
        },
        {
          task: "Inspect routing",
          pair: { providerID: "beta", modelID: "deep", variant: "medium" },
        },
      ],
    });

    expect(result.status).toBe("succeeded");
    expect(harness.requests.map(({ pair }) => pair)).toEqual([
      { providerID: "alpha", modelID: "fast", variant: "low" },
      { providerID: "beta", modelID: "deep", variant: "medium" },
    ]);
    expect(harness.maxActiveReaders).toBe(2);
  });

  it("runs implement, verify, and a fresh independent review", async () => {
    const harness = memoryHarness();
    const manager = new MinionManager(harness.ports);

    const result = await manager.implement({
      task: "Rename a label",
      parentSessionID: "parent",
      risk: "trivial",
    });

    expect(result.status).toBe("succeeded");
    expect(harness.requests.map(({ profile }) => profile)).toEqual([
      "minion/implement",
      "minion/verify",
      "minion/review",
    ]);
    expect(harness.requests[2]).not.toHaveProperty("hiddenReasoning");
  });

  it("reuses the implementation child for a bounded correction cycle", async () => {
    const harness = memoryHarness({ blocking: { "minion/verify": 1 } });
    const manager = new MinionManager(harness.ports);

    const result = await manager.implement({
      task: "Correct a label",
      parentSessionID: "parent",
      risk: "trivial",
    });

    expect(result.status).toBe("succeeded");
    expect(result.record.correctionCount).toBe(1);
    const implementations = harness.requests.filter(
      (request) => request.profile === "minion/implement",
    );
    expect(implementations).toHaveLength(2);
    expect(implementations[1]?.resumeSessionID).toBe("child-1");
  });

  it("interrupts every owned child on cancellation", async () => {
    const harness = memoryHarness({ waitForAbort: true });
    const manager = new MinionManager(harness.ports);
    const pending = manager.research({
      task: "Wait",
      parentSessionID: "parent",
      inquiries: [{ task: "Wait" }],
    });
    await harness.started;

    await manager.cancelCurrent();
    const result = await pending;

    expect(result.status).toBe("cancelled");
    expect(harness.interrupted).toEqual(["child-1"]);
  });
});
