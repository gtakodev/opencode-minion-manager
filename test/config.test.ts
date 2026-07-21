import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, loadConfig } from "../src/core/config.js";

describe("configuration seam", () => {
  it("loads conservative zero-configuration defaults", () => {
    const result = loadConfig();

    expect(result).toEqual({ ok: true, value: DEFAULT_CONFIG });
    if (result.ok) {
      expect(result.value.limits).toMatchObject({
        readers: 3,
        writers: 1,
        history: 50,
        corrections: 2,
      });
      expect(result.value.approvals).toBe("adaptive");
    }
  });

  it("merges project and plugin overrides above global settings", () => {
    const result = loadConfig(
      { motion: "off", limits: { readers: 2 } },
      { motion: "reduced", limits: { history: 20 } },
      { limits: { readers: 1 } },
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        motion: "reduced",
        limits: { readers: 1, history: 20, writers: 1 },
      },
    });
  });

  it("returns an actionable diagnostic for unsupported schemas", () => {
    expect(loadConfig({ schemaVersion: 99 })).toEqual({
      ok: false,
      diagnostic:
        "Unsupported Minion Manager configuration schema version 99; supported version is 1.",
    });
  });
});
