import type { TuiPlugin } from "@opencode-ai/plugin/tui";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { DEFAULT_CONFIG, loadConfig, type ConfigInput } from "./core/config.js";
import { FileRunStorage } from "./core/persistence.js";
import { RunMachine } from "./core/state.js";
import { PICKER_OPTIONS, formatStatusBand } from "./core/ui.js";
import {
  PROFILES,
  type Profile,
  type RunRecord,
  type Workflow,
} from "./core/types.js";
import type { StatusBand } from "./core/ui.js";

export const id = "opencode.minion-manager";

export const tui: TuiPlugin = async (api) => {
  const effectiveConfig = await loadTuiConfig(
    api.state.path.config,
    api.state.path.worktree,
  );
  const shortcut = effectiveConfig.appearance.shortcut;
  let motionTick = 0;
  const shortcutCollision = api.tuiConfig.keybinds.bindings.some(
    (binding) =>
      String(binding.key) === shortcut && binding.cmd !== "manager.open",
  );
  api.kv.set("manager.motion", effectiveConfig.motion);
  if (effectiveConfig.motion === "full") {
    const motionTimer = setInterval(() => {
      motionTick += 1;
      api.renderer.requestRender();
    }, 700);
    motionTimer.unref();
    api.lifecycle.onDispose(() => clearInterval(motionTimer));
  }
  const modes = new Map<string, Workflow>();
  const runtimeStates = new Map<string, StatusBand["state"]>();
  const runs = new Map<string, RunRecord>();
  const currentSession = (): string | undefined => {
    const route = api.route.current;
    const sessionID = "params" in route ? route.params?.sessionID : undefined;
    return route.name === "session" && typeof sessionID === "string"
      ? sessionID
      : undefined;
  };
  const openPicker = () => {
    const sessionID = currentSession();
    const current = sessionID ? modes.get(sessionID) : undefined;
    api.ui.dialog.setSize("large");
    api.ui.dialog.replace(() =>
      api.ui.DialogSelect<Workflow>({
        title: "Minion Manager",
        ...(current ? { current } : {}),
        options: PICKER_OPTIONS.map((option) => ({
          title: `${option.icon}  ${option.label}`,
          value: option.value,
          description: pickerDescription(option.value),
        })),
        onSelect: async (option) => {
          const sessionID = currentSession();
          if (sessionID) {
            modes.set(sessionID, option.value);
            await api.client.v2.session.switchAgent({
              sessionID,
              agent: "Manager",
            });
          }
          api.kv.set(`manager.mode.${sessionID ?? "home"}`, option.value);
          api.ui.dialog.clear();
          api.ui.toast({
            variant: "success",
            title: "Manager",
            message: `${option.value} mode is ready.`,
          });
        },
      }),
    );
  };
  const openSettings = () => {
    const projectPath = join(
      api.state.path.worktree,
      ".opencode",
      "minion-manager.json",
    );
    const globalPath = join(api.state.path.config, "minion-manager.json");
    const saveProfileRoute = async (
      profile: Profile,
      providerID: string,
      modelID: string,
      variant?: string,
    ) => {
      let project: ConfigInput = { schemaVersion: 1 };
      try {
        project = JSON.parse(
          await readFile(projectPath, "utf8"),
        ) as ConfigInput;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      project.models ??= {};
      project.models.profiles ??= {};
      project.models.profiles[profile] = {
        mode: "pin",
        pair: { providerID, modelID, ...(variant ? { variant } : {}) },
      };
      await saveSettings(projectPath, project);
      api.ui.dialog.clear();
      api.ui.toast({
        variant: "success",
        title: "Manager route",
        message: `${profile} → ${providerID}/${modelID}${variant ? `#${variant}` : ""}`,
      });
    };
    const selectProfileRoute = () => {
      const allowed = api.state.provider.flatMap((provider) =>
        Object.values(provider.models)
          .filter((model) => {
            const key = `${provider.id}/${model.id}`;
            return (
              !effectiveConfig.models.deny.includes(key) &&
              (!effectiveConfig.models.allow.length ||
                effectiveConfig.models.allow.includes(key))
            );
          })
          .map((model) => ({ provider, model })),
      );
      api.ui.dialog.replace(() =>
        api.ui.DialogSelect<Profile>({
          title: "Choose Minion profile",
          options: PROFILES.map((profile) => ({
            title: profile,
            value: profile,
          })),
          onSelect: (profileOption) =>
            api.ui.dialog.replace(() =>
              api.ui.DialogSelect({
                title: `Route ${profileOption.value}`,
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
                      profileOption.value,
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
                          profileOption.value,
                          modelOption.value.providerID,
                          modelOption.value.model.id,
                          variantOption.value,
                        ),
                    }),
                  );
                },
              }),
            ),
        }),
      );
    };
    const edit = async (scope: "Project" | "Global", path: string) => {
      let current = DEFAULT_CONFIG;
      try {
        current = JSON.parse(await readFile(path, "utf8")) as typeof current;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      api.ui.dialog.replace(() =>
        api.ui.DialogPrompt({
          title: `${scope} Manager settings`,
          description: () => (
            <text fg={api.theme.current.textMuted}>
              Models · Limits · Approvals · Workflows · Appearance
            </text>
          ),
          value: JSON.stringify(current, null, 2),
          onConfirm: async (value) => {
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
            const validated = loadConfig(
              scope === "Global" ? candidate : undefined,
              scope === "Project" ? candidate : undefined,
            );
            if (!validated.ok) {
              api.ui.toast({
                variant: "error",
                message: validated.diagnostic,
              });
              return;
            }
            await saveSettings(path, candidate);
            if (candidate.motion)
              api.kv.set("manager.motion", candidate.motion);
            api.ui.dialog.clear();
            api.ui.toast({
              variant: "success",
              title: "Manager settings",
              message: `${scope} settings saved and validated.`,
            });
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
            title: "Route a Minion profile",
            value: "route-profile",
            description:
              "Choose an exact live policy-filtered model and variant",
          },
          {
            title: "Edit Project",
            value: "project",
            description: projectPath,
          },
          {
            title: "Edit Global",
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
          if (option.value === "route-profile") return selectProfileRoute();
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
        name: "manager.open",
        title: "Open Minion Manager",
        category: "Manager",
        run: openPicker,
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
        return visibleWorkflow ? (
          <text
            fg={statusColor(
              api,
              runState ?? runtimeStates.get(props.session_id) ?? "ready",
            )}
          >
            {withMotion(
              formatStatusBand(
                {
                  state:
                    runState ?? runtimeStates.get(props.session_id) ?? "ready",
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
            )}
          </text>
        ) : null;
      },
    },
  });
  api.lifecycle.onDispose(() => {
    void slotID;
  });

  if (api.command) {
    const disposeCommands = api.command.register(() => [
      {
        title: "Minion Manager",
        value: "manager.open",
        category: "Manager",
        slash: { name: "manager" },
        onSelect: openPicker,
      },
      {
        title: "Manager settings",
        value: "manager.settings",
        category: "Manager",
        slash: { name: "manager/settings" },
        onSelect: openSettings,
      },
      {
        title: "Manager history",
        value: "manager.history",
        category: "Manager",
        slash: { name: "manager/history" },
        onSelect: openHistory,
      },
      {
        title: "Disable Manager",
        value: "manager.off",
        category: "Manager",
        slash: { name: "manager/off" },
        onSelect: async () => {
          const sessionID = currentSession();
          if (sessionID) {
            modes.delete(sessionID);
            await api.client.v2.session.switchAgent({ sessionID });
          }
          api.ui.toast({ message: "Manager mode disabled." });
        },
      },
    ]);
    api.lifecycle.onDispose(disposeCommands);
  }

  if (!api.kv.get("manager.firstRunDismissed", false)) {
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
) {
  if (state === "waiting") return api.theme.current.warning;
  if (state === "success") return api.theme.current.success;
  if (state === "error") return api.theme.current.error;
  return api.theme.current.accent;
}

function runStatus(record: RunRecord): StatusBand["state"] {
  if (record.status === "succeeded") return "success";
  if (["failed", "cancelled", "abandoned", "partial"].includes(record.status))
    return "error";
  if (["waiting", "interrupted"].includes(record.status)) return "waiting";
  return "working";
}

function pickerDescription(workflow: Workflow): string {
  return {
    auto: "Classify the task, announce the workflow, then coordinate it",
    implement: "Plan when useful, implement, verify, and independently review",
    review: "Inspect an explicit or detected scope without editing",
    research: "Investigate code, external sources, or both with evidence",
  }[workflow];
}

export default tui;

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
): string {
  if (motion === "off") return status;
  const frames = motion === "full" ? ["◈", "◇", "◆", "◇"] : ["◆"];
  return status.replace(/^◈/, frames[tick % frames.length]!);
}
