import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { DEFAULT_CONFIG, loadConfig, type ConfigInput } from "./core/config.js";
import { FileRunStorage } from "./core/persistence.js";
import { RunMachine } from "./core/state.js";
import { PICKER_OPTIONS, formatStatusBand } from "./core/ui.js";
import {
  PROFILES,
  type PhaseName,
  type Profile,
  type RunRecord,
  type Workflow,
} from "./core/types.js";
import type { StatusBand } from "./core/ui.js";
import { ManagerWorkflowPicker, workflowColor } from "./tui-picker.js";

export const id = "opencode.minion-manager";

export const tui: TuiPlugin = async (api) => {
  const effectiveConfig = await loadTuiConfig(
    api.state.path.config,
    api.state.path.worktree,
  );
  const modes = new Map<string, Workflow>();
  const runtimeStates = new Map<string, StatusBand["state"]>();
  const runs = new Map<string, RunRecord>();
  const shortcut = effectiveConfig.appearance.shortcut;
  let motionTick = 0;
  const shortcutCollision = api.tuiConfig.keybinds.bindings.some(
    (binding) =>
      String(binding.key) === shortcut && binding.cmd !== "manager.open",
  );
  api.kv.set("manager.motion", effectiveConfig.motion);
  if (effectiveConfig.motion === "full") {
    const motionTimer = setInterval(() => {
      const hasActiveAgent =
        [...runtimeStates.values()].some((state) => state === "working") ||
        [...runs.values()].some((run) => run.status === "running");
      if (!hasActiveAgent) return;
      motionTick += 1;
      api.renderer.requestRender();
    }, 700);
    motionTimer.unref();
    api.lifecycle.onDispose(() => clearInterval(motionTimer));
  }
  const currentSession = (): string | undefined => {
    const route = api.route.current;
    const sessionID = "params" in route ? route.params?.sessionID : undefined;
    return route.name === "session" && typeof sessionID === "string"
      ? sessionID
      : undefined;
  };
  const openPicker = () => {
    const sessionID = currentSession();
    const current =
      (sessionID ? modes.get(sessionID) : undefined) ??
      (api.kv.get(`manager.mode.${sessionID ?? "home"}`) as
        | Workflow
        | undefined);
    api.ui.dialog.setSize(api.renderer.width >= 96 ? "xlarge" : "large");
    const selectWorkflow = async (workflow: Workflow) => {
      const sessionID = currentSession();
      if (sessionID) {
        modes.set(sessionID, workflow);
        await api.client.v2.session.switchAgent({
          sessionID,
          agent: "Manager",
        });
      }
      api.kv.set(`manager.mode.${sessionID ?? "home"}`, workflow);
      api.ui.dialog.clear();
      api.ui.toast({
        variant: "success",
        title: "Manager",
        message: `${workflow} mode is ready.`,
      });
    };
    const show = (selected: number): void => {
      api.ui.dialog.replace(() => (
        <ManagerWorkflowPicker
          api={api}
          selected={selected}
          onMove={show}
          onSelect={selectWorkflow}
          onClose={() => api.ui.dialog.clear()}
        />
      ));
    };
    show(
      Math.max(
        0,
        PICKER_OPTIONS.findIndex((option) => option.value === current),
      ),
    );
  };
  const openSettings = () => {
    type SettingsScope = "Project" | "Global";
    const projectPath = join(
      api.state.path.worktree,
      ".opencode",
      "minion-manager.json",
    );
    const globalPath = join(api.state.path.config, "minion-manager.json");
    const readSettings = async (path: string): Promise<ConfigInput> => {
      try {
        return JSON.parse(await readFile(path, "utf8")) as ConfigInput;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return { schemaVersion: 1 };
      }
    };
    const edit = async (scope: SettingsScope, path: string) => {
      let current = await readSettings(path);
      const global =
        scope === "Project" ? await readSettings(globalPath) : current;
      const resolved = loadConfig(
        global,
        scope === "Project" ? current : undefined,
      );
      if (!resolved.ok) {
        api.ui.toast({ variant: "error", message: resolved.diagnostic });
        return;
      }
      const effective = resolved.value;
      const persist = async (message: string) => {
        const validated = loadConfig(
          scope === "Global" ? current : global,
          scope === "Project" ? current : undefined,
        );
        if (!validated.ok) {
          api.ui.toast({ variant: "error", message: validated.diagnostic });
          return false;
        }
        await saveSettings(path, current);
        if (current.motion) api.kv.set("manager.motion", current.motion);
        if (current.appearance?.firstRunDismissed !== undefined) {
          api.kv.set(
            "manager.firstRunDismissed",
            current.appearance.firstRunDismissed,
          );
        }
        api.ui.dialog.clear();
        api.ui.toast({
          variant: "success",
          title: "Manager settings",
          message,
        });
        return true;
      };
      const prompt = (
        title: string,
        value: string,
        onConfirm: (value: string) => void | Promise<void>,
        placeholder?: string,
      ) =>
        api.ui.dialog.replace(() =>
          api.ui.DialogPrompt({
            title,
            value,
            ...(placeholder ? { placeholder } : {}),
            onConfirm,
          }),
        );
      const promptInteger = (
        title: string,
        value: number,
        minimum: number,
        maximum: number,
        save: (value: number) => void,
      ) =>
        prompt(title, String(value), async (input) => {
          const parsed = Number(input);
          if (
            !Number.isInteger(parsed) ||
            parsed < minimum ||
            parsed > maximum
          ) {
            api.ui.toast({
              variant: "error",
              message: `Enter a whole number from ${minimum} to ${maximum}.`,
            });
            return;
          }
          save(parsed);
          await persist(`${scope} ${title.toLowerCase()} updated.`);
        });
      const selectProfileRoute = () => {
        const allowed = api.state.provider.flatMap((provider) =>
          Object.values(provider.models)
            .filter((model) => {
              const key = `${provider.id}/${model.id}`;
              return (
                !effective.models.deny.includes(key) &&
                (!effective.models.allow.length ||
                  effective.models.allow.includes(key))
              );
            })
            .map((model) => ({ provider, model })),
        );
        const saveProfileRoute = async (
          profile: Profile,
          mode: "prefer" | "pin",
          providerID: string,
          modelID: string,
          variant?: string,
        ) => {
          current.models ??= {};
          current.models.profiles ??= {};
          current.models.profiles[profile] = {
            mode,
            pair: { providerID, modelID, ...(variant ? { variant } : {}) },
          };
          await persist(
            `${profile} → ${mode} ${providerID}/${modelID}${variant ? `#${variant}` : ""}`,
          );
        };
        const selectPair = (profile: Profile, mode: "prefer" | "pin") =>
          api.ui.dialog.replace(() =>
            api.ui.DialogSelect({
              title: `${mode === "pin" ? "Pin" : "Prefer"} · ${profile}`,
              options: allowed.map(({ provider, model }) => ({
                title: `${provider.name} · ${model.name}`,
                value: { providerID: provider.id, model },
                description: `${provider.id}/${model.id} · context ${model.limit.context} · output ${model.limit.output}`,
              })),
              onSelect: (modelOption) => {
                const variants = Object.keys(
                  modelOption.value.model.variants ?? {},
                );
                if (!variants.length) {
                  void saveProfileRoute(
                    profile,
                    mode,
                    modelOption.value.providerID,
                    modelOption.value.model.id,
                  );
                  return;
                }
                api.ui.dialog.replace(() =>
                  api.ui.DialogSelect<string | undefined>({
                    title: `Variant · ${modelOption.value.model.name}`,
                    options: [
                      { title: "Provider default", value: undefined },
                      ...variants.map((variant) => ({
                        title: variant,
                        value: variant,
                      })),
                    ],
                    onSelect: (variantOption) =>
                      void saveProfileRoute(
                        profile,
                        mode,
                        modelOption.value.providerID,
                        modelOption.value.model.id,
                        variantOption.value,
                      ),
                  }),
                );
              },
            }),
          );
        api.ui.dialog.replace(() =>
          api.ui.DialogSelect<Profile>({
            title: "Choose Minion profile",
            options: PROFILES.map((profile) => ({
              title: profile,
              value: profile,
              description: effective.models.profiles[profile]?.mode ?? "auto",
            })),
            onSelect: (profileOption) =>
              api.ui.dialog.replace(() =>
                api.ui.DialogSelect<"auto" | "prefer" | "pin">({
                  title: `Routing mode · ${profileOption.value}`,
                  current:
                    effective.models.profiles[profileOption.value]?.mode ??
                    "auto",
                  options: [
                    { title: "Auto", value: "auto" },
                    { title: "Prefer", value: "prefer" },
                    { title: "Pin", value: "pin" },
                  ],
                  onSelect: async (modeOption) => {
                    if (modeOption.value !== "auto")
                      return selectPair(profileOption.value, modeOption.value);
                    current.models ??= {};
                    current.models.profiles ??= {};
                    current.models.profiles[profileOption.value] = {
                      mode: "auto",
                    };
                    await persist(
                      `${profileOption.value} routing set to auto.`,
                    );
                  },
                }),
              ),
          }),
        );
      };
      const showModels = () =>
        api.ui.dialog.replace(() =>
          api.ui.DialogSelect({
            title: `${scope} · Models`,
            options: [
              {
                title: "Profile routing",
                value: "routing",
                description: "Auto, Prefer, or Pin using the live catalog",
              },
              {
                title: "Allowed models",
                value: "allow",
                description: effective.models.allow.join(", ") || "Any model",
              },
              {
                title: "Denied models",
                value: "deny",
                description: effective.models.deny.join(", ") || "None",
              },
            ],
            onSelect: (option) => {
              if (option.value === "routing") return selectProfileRoute();
              const key = option.value as "allow" | "deny";
              prompt(
                `${scope} · ${key === "allow" ? "Allowed" : "Denied"} models`,
                effective.models[key].join(", "),
                async (value) => {
                  const entries = value
                    .split(/[\n,]/)
                    .map((entry) => entry.trim())
                    .filter(Boolean);
                  const catalog = new Set(
                    api.state.provider.flatMap((provider) =>
                      Object.values(provider.models).map(
                        (model) => `${provider.id}/${model.id}`,
                      ),
                    ),
                  );
                  const unknown = entries.filter(
                    (entry) => !catalog.has(entry),
                  );
                  if (unknown.length) {
                    api.ui.toast({
                      variant: "error",
                      message: `Unknown enabled model${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`,
                    });
                    return;
                  }
                  current.models ??= {};
                  current.models[key] = entries;
                  await persist(`${scope} model policy updated.`);
                },
                "provider/model, provider/model",
              );
            },
          }),
        );
      const showLimits = () =>
        api.ui.dialog.replace(() =>
          api.ui.DialogSelect({
            title: `${scope} · Limits`,
            options: [
              {
                title: "Concurrent readers",
                value: "readers",
                description: String(effective.limits.readers),
              },
              {
                title: "Concurrent writers",
                value: "writers",
                description: "1 · fixed safety boundary",
                disabled: true,
              },
              {
                title: "History entries",
                value: "history",
                description: String(effective.limits.history),
              },
              {
                title: "Known-cost budget",
                value: "budget",
                description: effective.limits.budget?.toString() ?? "Unlimited",
              },
            ],
            onSelect: (option) => {
              current.limits ??= {};
              if (option.value === "readers")
                return promptInteger(
                  "Concurrent readers",
                  effective.limits.readers,
                  1,
                  3,
                  (value) => (current.limits!.readers = value),
                );
              if (option.value === "history")
                return promptInteger(
                  "History entries",
                  effective.limits.history,
                  1,
                  500,
                  (value) => (current.limits!.history = value),
                );
              if (option.value === "budget")
                prompt(
                  "Known-cost budget",
                  effective.limits.budget?.toString() ?? "",
                  async (input) => {
                    const budget = input.trim() === "" ? null : Number(input);
                    if (
                      budget !== null &&
                      (!Number.isFinite(budget) || budget < 0)
                    ) {
                      api.ui.toast({
                        variant: "error",
                        message: "Enter a non-negative number or leave blank.",
                      });
                      return;
                    }
                    current.limits!.budget = budget;
                    await persist(`${scope} budget updated.`);
                  },
                  "Blank means unlimited",
                );
            },
          }),
        );
      const showApprovals = () =>
        api.ui.dialog.replace(() =>
          api.ui.DialogSelect<"adaptive" | "always" | "never">({
            title: `${scope} · Approvals`,
            current: effective.approvals,
            options: [
              { title: "Adaptive", value: "adaptive" },
              { title: "Always", value: "always" },
              { title: "Never", value: "never" },
            ],
            onSelect: async (option) => {
              current.approvals = option.value;
              await persist(`${scope} approval policy updated.`);
            },
          }),
        );
      const showWorkflows = () =>
        api.ui.dialog.replace(() =>
          api.ui.DialogSelect({
            title: `${scope} · Workflows`,
            options: [
              {
                title: "Automatic correction cycles",
                value: "corrections",
                description: String(effective.limits.corrections),
              },
            ],
            onSelect: () => {
              current.limits ??= {};
              promptInteger(
                "Automatic correction cycles",
                effective.limits.corrections,
                0,
                2,
                (value) => (current.limits!.corrections = value),
              );
            },
          }),
        );
      const showAppearance = () =>
        api.ui.dialog.replace(() =>
          api.ui.DialogSelect({
            title: `${scope} · Appearance`,
            options: [
              {
                title: "Motion",
                value: "motion",
                description: effective.motion,
              },
              {
                title: "Manager shortcut",
                value: "shortcut",
                description: effective.appearance.shortcut,
              },
              {
                title: "First-run assistant",
                value: "first-run",
                description: effective.appearance.firstRunDismissed
                  ? "Dismissed"
                  : "Shown",
              },
            ],
            onSelect: (option) => {
              if (option.value === "motion")
                return api.ui.dialog.replace(() =>
                  api.ui.DialogSelect<"full" | "reduced" | "off">({
                    title: `${scope} · Motion`,
                    current: effective.motion,
                    options: [
                      { title: "Full", value: "full" },
                      { title: "Reduced", value: "reduced" },
                      { title: "Off", value: "off" },
                    ],
                    onSelect: async (motion) => {
                      current.motion = motion.value;
                      await persist(`${scope} motion updated.`);
                    },
                  }),
                );
              current.appearance ??= {};
              if (option.value === "shortcut")
                return prompt(
                  `${scope} · Manager shortcut`,
                  effective.appearance.shortcut,
                  async (value) => {
                    current.appearance!.shortcut = value.trim();
                    await persist(`${scope} shortcut updated.`);
                  },
                );
              api.ui.dialog.replace(() =>
                api.ui.DialogSelect<boolean>({
                  title: `${scope} · First-run assistant`,
                  current: effective.appearance.firstRunDismissed,
                  options: [
                    { title: "Show", value: false },
                    { title: "Dismiss", value: true },
                  ],
                  onSelect: async (value) => {
                    current.appearance!.firstRunDismissed = value.value;
                    await persist(`${scope} first-run preference updated.`);
                  },
                }),
              );
            },
          }),
        );
      const showAdvanced = () =>
        prompt(
          `${scope} · Advanced JSON`,
          JSON.stringify(current, null, 2),
          async (value) => {
            let candidate: ConfigInput;
            try {
              candidate = JSON.parse(value) as ConfigInput;
            } catch (error) {
              api.ui.toast({
                variant: "error",
                message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
              });
              return;
            }
            current = candidate;
            await persist(`${scope} advanced settings updated.`);
          },
        );
      api.ui.dialog.replace(() =>
        api.ui.DialogSelect({
          title: `${scope} Manager settings`,
          options: [
            { title: "Models", value: "models" },
            { title: "Limits", value: "limits" },
            { title: "Approvals", value: "approvals" },
            { title: "Workflows", value: "workflows" },
            { title: "Appearance", value: "appearance" },
            {
              title: "Advanced JSON",
              value: "advanced",
              description: "Debug and uncommon settings",
            },
          ],
          onSelect: (option) => {
            if (option.value === "models") return showModels();
            if (option.value === "limits") return showLimits();
            if (option.value === "approvals") return showApprovals();
            if (option.value === "workflows") return showWorkflows();
            if (option.value === "appearance") return showAppearance();
            showAdvanced();
          },
        }),
      );
    };
    api.ui.dialog.setSize("large");
    api.ui.dialog.replace(() =>
      api.ui.DialogSelect({
        title: "Manager settings",
        options: [
          {
            title: "Project settings",
            value: "project",
            description: projectPath,
          },
          {
            title: "Global settings",
            value: "global",
            description: globalPath,
          },
          {
            title: "Restore Project defaults",
            value: "restore-project",
          },
          {
            title: "Restore Global defaults",
            value: "restore-global",
          },
        ],
        onSelect: async (option) => {
          if (option.value === "project") return edit("Project", projectPath);
          if (option.value === "global") return edit("Global", globalPath);
          const scope =
            option.value === "restore-project" ? "Project" : "Global";
          const path = scope === "Project" ? projectPath : globalPath;
          api.ui.dialog.replace(() =>
            api.ui.DialogConfirm({
              title: `Restore ${scope} defaults?`,
              message: `Replace ${path} with conservative zero-config defaults.`,
              onConfirm: async () => {
                await saveSettings(
                  path,
                  scope === "Project" ? { schemaVersion: 1 } : DEFAULT_CONFIG,
                );
                api.ui.dialog.clear();
                api.ui.toast({
                  variant: "success",
                  message: `${scope} defaults restored.`,
                });
              },
            }),
          );
        },
      }),
    );
  };
  const openHistory = async () => {
    const historyStorage = new FileRunStorage(
      join(api.state.path.worktree, ".opencode", "minion-manager", "runs.json"),
    );
    let records: RunRecord[];
    try {
      records = await historyStorage.list();
    } catch (error) {
      api.ui.toast({
        variant: "error",
        title: "Manager history",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    if (!records.length) {
      api.ui.toast({ message: "No Manager runs have been recorded yet." });
      return;
    }
    api.ui.dialog.setSize("large");
    api.ui.dialog.replace(() =>
      api.ui.DialogSelect({
        title: "Manager history",
        options: records.map((record) => ({
          title: `${record.workflow} · ${record.status}`,
          value: record.id,
          description: `${new Date(record.updatedAt).toLocaleString()} · ${record.phases.length} phases`,
        })),
        onSelect: (option) => {
          const record = records.find(
            (candidate) => candidate.id === option.value,
          );
          if (!record) return;
          api.ui.dialog.replace(() =>
            api.ui.DialogSelect({
              title: `${record.workflow} · ${record.status}`,
              options: [
                { title: "Inspect details", value: "inspect" },
                ...(record.status === "interrupted"
                  ? [
                      {
                        title: "Resume",
                        value: "resume",
                        description:
                          "Revalidate and continue in a new child action",
                      },
                      {
                        title: "Restart phase",
                        value: "restart-phase",
                        description:
                          "Revalidate and restart the interrupted phase",
                      },
                      {
                        title: "Abandon",
                        value: "abandon",
                        description:
                          "Mark metadata abandoned; do not touch files",
                      },
                    ]
                  : []),
                {
                  title: "Delete metadata",
                  value: "delete",
                  description: "Keep OpenCode sessions and project files",
                },
              ],
              onSelect: async (action) => {
                if (
                  action.value === "resume" ||
                  action.value === "restart-phase"
                ) {
                  const sessionID = currentSession() ?? record.managerSessionID;
                  if (!sessionID) {
                    api.ui.toast({
                      variant: "error",
                      message:
                        "Open the original Manager session to recover this run.",
                    });
                    return;
                  }
                  await api.client.session.prompt({
                    sessionID,
                    agent: "Manager",
                    parts: [
                      {
                        type: "text",
                        text: `Call manager_recover with runID ${record.id} and action ${action.value}. Original ${record.workflow} task: ${record.task}`,
                      },
                    ],
                  });
                  api.ui.dialog.clear();
                  return;
                }
                if (action.value === "delete") {
                  await historyStorage.delete(record.id);
                  api.ui.dialog.clear();
                  api.ui.toast({ message: "Run metadata deleted." });
                  return;
                }
                if (action.value === "abandon") {
                  const machine = new RunMachine(record);
                  machine.finish("abandoned", Date.now());
                  delete machine.record.recovery;
                  await historyStorage.save(machine.record);
                  api.ui.dialog.clear();
                  api.ui.toast({ message: "Interrupted run abandoned." });
                  return;
                }
                api.ui.dialog.replace(() =>
                  api.ui.DialogAlert({
                    title: `${record.workflow} · ${record.status}`,
                    message: [
                      `Run: ${record.id}`,
                      `Task: ${record.task}`,
                      `Corrections: ${record.correctionCount}`,
                      ...record.phases.map(
                        (phase) =>
                          `${phase.name} · ${phase.status} · ${phase.profile ?? "-"} · ${phase.model ? `${phase.model.pair.providerID}/${phase.model.pair.modelID}${phase.model.pair.variant ? `#${phase.model.pair.variant}` : ""}` : "-"}`,
                      ),
                      ...record.errors.map((error) => `Error: ${error}`),
                      ...(record.recovery
                        ? [`Recovery: ${record.recovery.join(" · ")}`]
                        : []),
                    ].join("\n"),
                  }),
                );
              },
            }),
          );
        },
      }),
    );
  };

  const disposeKeymap = api.keymap.registerLayer({
    commands: [
      {
        namespace: "palette",
        name: "manager.open",
        title: "Open Minion Manager",
        desc: "Choose a Manager workflow",
        category: "Manager",
        slashName: "manager",
        run: openPicker,
      },
      {
        namespace: "palette",
        name: "manager.settings",
        title: "Manager settings",
        desc: "Inspect and edit Manager settings",
        category: "Manager",
        slashName: "manager/settings",
        run: openSettings,
      },
      {
        namespace: "palette",
        name: "manager.history",
        title: "Manager history",
        desc: "Inspect Manager run history",
        category: "Manager",
        slashName: "manager/history",
        run: openHistory,
      },
      {
        namespace: "palette",
        name: "manager.off",
        title: "Disable Manager",
        category: "Manager",
        slashName: "manager/off",
        run: async () => {
          const sessionID = currentSession();
          if (sessionID) {
            modes.delete(sessionID);
            await api.client.v2.session.switchAgent({ sessionID });
          }
          api.ui.toast({ message: "Manager mode disabled." });
        },
      },
    ],
    bindings: shortcutCollision ? [] : [{ key: shortcut, cmd: "manager.open" }],
  });
  api.lifecycle.onDispose(disposeKeymap);
  if (shortcutCollision) {
    api.ui.toast({
      variant: "warning",
      title: "Manager shortcut",
      message: `${shortcut} is already bound; use /manager or configure another shortcut.`,
    });
  }

  api.lifecycle.onDispose(
    api.event.on("session.status", (event) => {
      runtimeStates.set(
        event.properties.sessionID,
        event.properties.status.type === "retry" ? "waiting" : "working",
      );
    }),
  );

  const refreshRuns = async () => {
    try {
      const records = await new FileRunStorage(
        join(
          api.state.path.worktree,
          ".opencode",
          "minion-manager",
          "runs.json",
        ),
      ).list();
      for (const record of records) {
        if (
          record.managerSessionID &&
          (!runs.has(record.managerSessionID) ||
            runs.get(record.managerSessionID)?.updatedAt !== record.updatedAt)
        ) {
          runs.set(record.managerSessionID, record);
          api.renderer.requestRender();
        }
      }
    } catch {
      // History may not exist before the first run.
    }
  };
  const refreshTimer = setInterval(() => void refreshRuns(), 750);
  refreshTimer.unref();
  api.lifecycle.onDispose(() => clearInterval(refreshTimer));
  api.lifecycle.onDispose(
    api.event.on("session.idle", (event) => {
      runtimeStates.set(event.properties.sessionID, "ready");
    }),
  );
  api.lifecycle.onDispose(
    api.event.on("session.error", (event) => {
      if (event.properties.sessionID)
        runtimeStates.set(event.properties.sessionID, "error");
    }),
  );

  const disposeRoute = api.route.register([
    {
      name: "manager.settings",
      render: () => (
        <text fg={api.theme.current.text}>
          {`Models: ${api.state.provider.reduce((count, provider) => count + Object.keys(provider.models).length, 0)} live · Limits: ${DEFAULT_CONFIG.limits.readers} readers / 1 writer / ${DEFAULT_CONFIG.limits.corrections} corrections · Approvals: ${DEFAULT_CONFIG.approvals} · Motion: ${api.kv.get("manager.motion", DEFAULT_CONFIG.motion)}\nProject: ${join(api.state.path.worktree, ".opencode", "minion-manager.json")}\nGlobal: ${join(api.state.path.config, "minion-manager.json")}`}
        </text>
      ),
    },
    {
      name: "manager.history",
      render: () => (
        <text fg={api.theme.current.text}>
          {`Run history and recovery metadata: ${join(api.state.path.worktree, ".opencode", "minion-manager", "runs.json")}\nInterrupted records offer Resume, Restart phase, and Abandon; recovery always revalidates before execution.`}
        </text>
      ),
    },
  ]);
  api.lifecycle.onDispose(disposeRoute);

  const slotID = api.slots.register({
    slots: {
      session_prompt: (_context, props) => {
        const workflow =
          modes.get(props.session_id) ??
          (api.kv.get(`manager.mode.${props.session_id}`) as
            | Workflow
            | undefined);
        const run = runs.get(props.session_id);
        const activePhase = run?.phases.findLast(
          (phase) => phase.status === "active",
        );
        const runState = run ? runStatus(run) : undefined;
        const visibleWorkflow = workflow ?? run?.workflow;
        const visibleState =
          runState ?? runtimeStates.get(props.session_id) ?? "ready";
        return visibleWorkflow ? (
          <text
            fg={statusColor(
              api,
              visibleState,
              visibleWorkflow,
              activePhase?.name,
            )}
          >
            {withMotion(
              formatStatusBand(
                {
                  state: visibleState,
                  workflow: visibleWorkflow,
                  ...(run
                    ? {
                        step: Math.max(
                          1,
                          run.phases.filter(
                            (phase) => phase.status !== "active",
                          ).length + (activePhase ? 1 : 0),
                        ),
                        total: Math.max(
                          run.workflow === "implement" ? 3 : 1,
                          run.phases.length,
                        ),
                      }
                    : {}),
                  ...(activePhase?.profile
                    ? { profile: activePhase.profile }
                    : {}),
                  ...(activePhase?.model
                    ? {
                        model: activePhase.model.pair.modelID,
                        ...(activePhase.model.pair.variant
                          ? { variant: activePhase.model.pair.variant }
                          : {}),
                      }
                    : {}),
                },
                api.renderer.width,
              ),
              api.kv.get("manager.motion", effectiveConfig.motion),
              motionTick,
              visibleState === "working",
              visibleWorkflow,
            )}
          </text>
        ) : null;
      },
    },
  });
  api.lifecycle.onDispose(() => {
    void slotID;
  });

  if (
    !api.kv.get(
      "manager.firstRunDismissed",
      effectiveConfig.appearance.firstRunDismissed,
    )
  ) {
    api.ui.toast({
      title: "Minion Manager",
      message:
        "Use /manager to choose a workflow. Defaults keep one writer and up to three readers.",
      duration: 8000,
    });
    api.kv.set("manager.firstRunDismissed", true);
  }
};

function statusColor(
  api: Parameters<TuiPlugin>[0],
  state: StatusBand["state"],
  workflow: Workflow,
  phase?: PhaseName,
) {
  if (state === "waiting") return api.theme.current.warning;
  if (state === "success") return api.theme.current.success;
  if (state === "error") return api.theme.current.error;
  if (state === "working" && phase)
    return {
      planning: api.theme.current.info,
      implementing: api.theme.current.success,
      verifying: api.theme.current.warning,
      reviewing: api.theme.current.accent,
      researching: api.theme.current.warning,
      reporting: api.theme.current.accent,
    }[phase];
  return workflowColor(api, workflow);
}

function runStatus(record: RunRecord): StatusBand["state"] {
  if (record.status === "pending") return "ready";
  if (record.status === "succeeded") return "success";
  if (["failed", "cancelled", "abandoned", "partial"].includes(record.status))
    return "error";
  if (["waiting", "interrupted"].includes(record.status)) return "waiting";
  return "working";
}

export default { id, tui } satisfies TuiPluginModule;

async function saveSettings(path: string, config: ConfigInput): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, path);
}

async function loadTuiConfig(configDirectory: string, worktree: string) {
  const read = async (path: string): Promise<ConfigInput | undefined> => {
    try {
      return JSON.parse(await readFile(path, "utf8")) as ConfigInput;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  };
  const parsed = loadConfig(
    await read(join(configDirectory, "minion-manager.json")),
    await read(join(worktree, ".opencode", "minion-manager.json")),
  );
  return parsed.ok ? parsed.value : DEFAULT_CONFIG;
}

export function withMotion(
  status: string,
  motion: "full" | "reduced" | "off",
  tick: number,
  active = false,
  workflow: Workflow = "auto",
): string {
  if (motion !== "full" || !active) return status;
  const frames =
    PICKER_OPTIONS.find((option) => option.value === workflow)?.frames ??
    PICKER_OPTIONS[0].frames;
  return status.replace(/^\S+/, frames[tick % frames.length]!);
}
