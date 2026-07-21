import { describe, expect, it } from "vitest";
import type { Config } from "@opencode-ai/plugin";

import { registerConfig } from "../src/registration.js";

describe("OpenCode registration contract", () => {
  it("registers one coordinator and six non-recursive minions", () => {
    const config: Config = {};
    registerConfig(config);

    expect(config.agent?.Manager).toMatchObject({
      mode: "primary",
      tools: {
        edit: false,
        write: false,
        bash: false,
        task: false,
        minion_delegate: true,
        manager_run: true,
        manager_cancel: true,
        manager_catalog: true,
        manager_recover: true,
      },
      permission: { edit: "deny", bash: "deny" },
    });
    const minions = Object.entries(config.agent ?? {}).filter(([name]) =>
      name.startsWith("minion/"),
    );
    expect(minions).toHaveLength(6);
    expect(
      minions.every(
        ([, agent]) =>
          agent?.mode === "subagent" && agent.tools?.task === false,
      ),
    ).toBe(true);
  });

  it("registers every canonical command", () => {
    const config: Config = {};
    registerConfig(config);

    expect(Object.keys(config.command ?? {})).toEqual([
      "manager",
      "manager/implement",
      "manager/review",
      "manager/research",
      "manager/settings",
      "manager/history",
      "manager/cancel",
      "manager/off",
    ]);
  });
});
