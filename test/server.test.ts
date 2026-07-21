import { describe, expect, it } from "vitest";
import type { Config } from "@opencode-ai/plugin";

import { permissionsFromConfig } from "../src/server.js";

describe("live host permission view", () => {
  it("carries host denials into Minion Manager policy", () => {
    expect(
      permissionsFromConfig({
        permission: {
          read: "allow",
          edit: "deny",
          bash: "deny",
          webfetch: "ask",
          websearch: "deny",
        },
      } as unknown as Config),
    ).toEqual({ read: true, edit: false, shell: false, web: true });
  });

  it("does not widen patterned host denials into global capability access", () => {
    expect(
      permissionsFromConfig({
        permission: {
          read: { "*": "deny", "docs/**": "allow" },
          edit: { "*": "allow", ".env*": "deny" },
          bash: { "*": "deny", "git status": "allow" },
        },
      } as unknown as Config),
    ).toEqual({ read: false, edit: false, shell: false, web: true });
  });
});
