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
