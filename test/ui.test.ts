import { describe, expect, it, vi } from "vitest";

import { PICKER_OPTIONS, formatStatusBand } from "../src/core/ui.js";
import tuiModule, { tui, withMotion } from "../src/tui.js";

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
      "◆ Manager › Implement · 2/4 · minion/verify · sol#medium",
    );
    expect(formatStatusBand(status, 24)).toBe("◆ Implement · working");
    expect([...formatStatusBand(status, 36)].length).toBeLessThanOrEqual(36);
  });

  it("animates only active work in full-motion mode", () => {
    expect(
      withMotion("◉ Manager › Review · working", "full", 2, true, "review"),
    ).toBe("◎ Manager › Review · working");
    expect(
      withMotion("◉ Manager › Review · ready", "full", 2, false, "review"),
    ).toBe("◉ Manager › Review · ready");
    expect(
      withMotion(
        "◆ Manager › Implement · working",
        "reduced",
        9,
        true,
        "implement",
      ),
    ).toBe("◆ Manager › Implement · working");
    expect(
      withMotion("▥ Manager › Research · working", "off", 2, true, "research"),
    ).toBe("▥ Manager › Research · working");
  });

  it("uses stable workflow-specific status icons", () => {
    expect(PICKER_OPTIONS.map(({ value, icon }) => ({ value, icon }))).toEqual([
      { value: "auto", icon: "▣" },
      { value: "implement", icon: "◆" },
      { value: "review", icon: "◉" },
      { value: "research", icon: "▥" },
    ]);
    expect(
      PICKER_OPTIONS.every((option) =>
        option.frames.every((frame) => [...frame].length === 1),
      ),
    ).toBe(true);
    expect(
      PICKER_OPTIONS.every((option) =>
        option.sprite.every(
          (line) => [...line].length === [...option.sprite[0]].length,
        ),
      ),
    ).toBe(true);
  });

  it("keeps ready status still even when full motion is enabled", () => {
    expect(
      withMotion("▣ Manager › Auto · ready", "full", 9, false, "auto"),
    ).toBe("▣ Manager › Auto · ready");
  });

  it("keeps reduced motion still while preserving the selected icon", () => {
    expect(
      withMotion("◉ Manager › Review · working", "reduced", 9, true, "review"),
    ).toBe("◉ Manager › Review · working");
  });

  it("keeps disabled motion still", () => {
    expect(
      withMotion("▥ Manager › Research · working", "off", 2, true, "research"),
    ).toBe("▥ Manager › Research · working");
  });

  it("keeps generic inactive content unchanged", () => {
    expect(withMotion("plain status", "full", 2, false)).toBe("plain status");
  });

  it("exports the OpenCode TUI module shape", () => {
    expect(tuiModule).toMatchObject({
      id: "opencode.minion-manager",
      tui,
    });
  });

  it("registers manager settings as a native dialog command", async () => {
    const commands: Array<{
      slashName?: string;
      run?: () => void;
    }> = [];
    const dialogSelect = vi.fn((props) => props);
    const replace = vi.fn((render: () => unknown) => render());
    const values = new Map<string, unknown>([
      ["manager.firstRunDismissed", true],
    ]);
    const api = {
      state: {
        path: { config: "/tmp/minion-manager-config", worktree: process.cwd() },
        provider: [],
      },
      tuiConfig: { keybinds: { bindings: [] } },
      kv: {
        get: (key: string, fallback: unknown) =>
          values.has(key) ? values.get(key) : fallback,
        set: (key: string, value: unknown) => values.set(key, value),
      },
      renderer: { requestRender: vi.fn(), width: 80 },
      lifecycle: { onDispose: vi.fn() },
      route: {
        current: { name: "home" },
        register: vi.fn(() => vi.fn()),
        navigate: vi.fn(),
      },
      ui: {
        toast: vi.fn(),
        dialog: { setSize: vi.fn(), replace, clear: vi.fn() },
        DialogSelect: dialogSelect,
        DialogPrompt: vi.fn((props) => props),
        DialogConfirm: vi.fn((props) => props),
        DialogAlert: vi.fn((props) => props),
      },
      keymap: {
        registerLayer: vi.fn((layer) => {
          commands.push(...(layer.commands ?? []));
          return vi.fn();
        }),
        dispatchCommand: vi.fn(),
      },
      event: { on: vi.fn(() => vi.fn()) },
      slots: { register: vi.fn(() => "slot") },
      client: {
        v2: { session: { switchAgent: vi.fn() } },
        session: { prompt: vi.fn() },
      },
      theme: {
        current: {
          text: "white",
          textMuted: "gray",
          warning: "yellow",
          success: "green",
          error: "red",
          accent: "purple",
        },
      },
    };

    await tui(api as never, undefined, {} as never);
    const settings = commands.find(
      (command) => command.slashName === "manager/settings",
    );

    expect(settings).toBeDefined();
    settings?.run?.();
    expect(dialogSelect).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Manager settings" }),
    );

    const settingsMenu = dialogSelect.mock.calls.at(-1)?.[0] as {
      options: Array<{ value: string }>;
      onSelect: (option: { value: string }) => Promise<void>;
    };
    await settingsMenu.onSelect(
      settingsMenu.options.find((option) => option.value === "project")!,
    );
    expect(dialogSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Project Manager settings",
        options: expect.arrayContaining([
          expect.objectContaining({ title: "Models" }),
          expect.objectContaining({ title: "Limits" }),
          expect.objectContaining({ title: "Approvals" }),
          expect.objectContaining({ title: "Workflows" }),
          expect.objectContaining({ title: "Appearance" }),
        ]),
      }),
    );
    expect(api.client.session.prompt).not.toHaveBeenCalled();
  });
});
