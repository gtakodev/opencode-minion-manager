import { describe, expect, it } from "vitest";

import { blockingFromOutput } from "../src/adapters/opencode.js";

describe("OpenCode result contract", () => {
  it("conservatively blocks verify and review unless they explicitly pass", () => {
    expect(
      blockingFromOutput(
        "minion/verify",
        "All checks passed\nMINION_MANAGER_BLOCKING: false",
      ),
    ).toBe(false);
    expect(
      blockingFromOutput("minion/review", "Actionable finding without marker"),
    ).toBe(true);
    expect(
      blockingFromOutput("minion/review", "MINION_MANAGER_BLOCKING: true"),
    ).toBe(true);
    expect(blockingFromOutput("minion/research", "failed")).toBe(false);
  });
});
