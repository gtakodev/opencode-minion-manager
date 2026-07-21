import { describe, expect, it } from "vitest";

import { PICKER_OPTIONS, formatStatusBand } from "../src/core/ui.js";
import { withMotion } from "../src/tui.js";

describe("terminal presentation contract", () => {
  it("keeps the canonical picker order and portable glyphs", () => {
    expect(PICKER_OPTIONS.map((option) => option.value)).toEqual([
      "auto",
      "implement",
      "review",
      "research",
    ]);
    expect(
      PICKER_OPTIONS.every((option) =>
        /^[\u25a0-\u25ff\u2580-\u259f ]+$/.test(option.icon),
      ),
    ).toBe(true);
  });

  it("elides detail while preserving state and workflow", () => {
    const status = {
      state: "working" as const,
      workflow: "implement" as const,
      step: 2,
      total: 4,
      profile: "minion/verify" as const,
      model: "sol",
      variant: "medium",
    };

    expect(formatStatusBand(status, 80)).toBe(
      "◈ implement · 2/4 · minion/verify · sol#medium",
    );
    expect(formatStatusBand(status, 24)).toBe("◈ implement · working");
  });

  it("supports full, reduced, and disabled motion modes", () => {
    expect(withMotion("◈ implement · working", "full", 2)).toBe(
      "◆ implement · working",
    );
    expect(withMotion("◈ review · ready", "reduced", 9)).toBe(
      "◆ review · ready",
    );
    expect(withMotion("◈ research · ready", "off", 2)).toBe(
      "◈ research · ready",
    );
  });
});
