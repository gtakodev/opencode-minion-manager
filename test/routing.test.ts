import { describe, expect, it } from "vitest";

import { routeModel } from "../src/core/routing.js";

const catalog = [
  {
    providerID: "alpha",
    modelID: "fast",
    variants: ["low", "high"],
    capabilities: ["text", "tools"],
    cost: 1,
  },
  {
    providerID: "beta",
    modelID: "deep",
    variants: ["medium"],
    capabilities: ["text", "tools"],
    cost: 4,
  },
];

describe("model routing seam", () => {
  it("validates an exact pinned variant", () => {
    expect(
      routeModel(
        catalog,
        {
          mode: "pin",
          pair: { providerID: "alpha", modelID: "fast", variant: "high" },
        },
        {},
      ),
    ).toEqual({
      pair: { providerID: "alpha", modelID: "fast", variant: "high" },
      reason: "pinned by profile policy",
      fallback: false,
      cost: 1,
    });
  });

  it("fails before execution when a pinned variant is unavailable", () => {
    expect(() =>
      routeModel(
        catalog,
        {
          mode: "pin",
          pair: { providerID: "alpha", modelID: "fast", variant: "missing" },
        },
        {},
      ),
    ).toThrow(/variant.*missing.*unavailable/i);
  });

  it("records visible fallback for unavailable preferred models", () => {
    expect(
      routeModel(
        catalog,
        { mode: "prefer", pair: { providerID: "gone", modelID: "gone" } },
        {},
      ),
    ).toMatchObject({
      pair: { providerID: "alpha", modelID: "fast" },
      fallback: true,
      reason: expect.stringContaining("unavailable"),
    });
  });

  it("never routes to a denied model", () => {
    expect(
      routeModel(catalog, { mode: "auto" }, { deny: ["alpha/fast"] }),
    ).toMatchObject({
      pair: { providerID: "beta", modelID: "deep" },
    });
  });
});
