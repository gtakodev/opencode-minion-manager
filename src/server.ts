import { tool, type Config, type Plugin } from "@opencode-ai/plugin";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, parse as parsePath } from "node:path";
import { promisify } from "node:util";

import { loadConfig, type ConfigInput } from "./core/config.js";
import { GLOBAL_WRITER_LEASES, MinionManager } from "./core/orchestrator.js";
import { FileRunStorage } from "./core/persistence.js";
import { assertExactPair } from "./core/routing.js";
import { RunMachine } from "./core/state.js";
import { createRun, PROFILES, type HostPermissions } from "./core/types.js";
import { liveCatalog, OpenCodeSessionPort } from "./adapters/opencode.js";
import { registerConfig } from "./registration.js";

const pluginID = "opencode.minion-manager";
const execFileAsync = promisify(execFile);

export const server: Plugin = async (
  { serverUrl, directory, worktree },
  options,
) => {
  const storageRoot =
    worktree === parsePath(worktree).root ? directory : worktree;
  let globalConfig: ConfigInput | undefined;
  let projectConfig: ConfigInput | undefined;
  try {
    globalConfig = await readConfig(
      process.env.MINION_MANAGER_GLOBAL_CONFIG ??
        join(
          process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
          "opencode",
          "minion-manager.json",
        ),
    );
    projectConfig = await readConfig(
      join(storageRoot, ".opencode", "minion-manager.json"),
    );
  } catch (error) {
    console.error(
      `[${pluginID}] Invalid Minion Manager configuration: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {};
  }
  const parsed = loadConfig(
    globalConfig,
    projectConfig,
    (options?.config ?? options) as ConfigInput | undefined,
  );
  if (!parsed.ok) {
    console.error(`[${pluginID}] ${parsed.diagnostic}`);
    return {};
  }
  const config = parsed.value;
  const client = createOpencodeClient({
    baseUrl: serverUrl.toString(),
    directory,
  });
  const sessions = new OpenCodeSessionPort(client, directory);
  const storage = new FileRunStorage(
    join(storageRoot, ".opencode", "minion-manager", "runs.json"),
    config.limits.history,
  );
  await storage.markInterrupted(Date.now());
  const owned = new Set<string>();
  let activeManager: MinionManager | undefined;
  let effectiveHostPermissions: HostPermissions = {
    read: false,
    web: false,
    shell: false,
    edit: false,
  };

  return {
    config: async (hostConfig) => {
      effectiveHostPermissions = permissionsFromConfig(hostConfig);
      registerConfig(hostConfig);
    },
    tool: {
      manager_run: tool({
        description:
          "Run a complete persisted Manager workflow through the headless orchestration core.",
        args: {
          workflow: tool.schema.enum(["implement", "review", "research"]),
          task: tool.schema.string().min(1),
          risk: tool.schema
            .enum(["trivial", "normal", "complex", "destructive"])
            .optional(),
          forceAuto: tool.schema.boolean().optional(),
          target: tool.schema.string().min(1).optional(),
          reportDestination: tool.schema.string().min(1).optional(),
          inquiries: tool.schema
            .array(tool.schema.string().min(1))
            .max(3)
            .optional(),
          routes: tool.schema
            .array(
              tool.schema.object({
                profile: tool.schema.enum(PROFILES),
                providerID: tool.schema.string().min(1),
                modelID: tool.schema.string().min(1),
                variant: tool.schema.string().min(1).optional(),
              }),
            )
            .max(PROFILES.length)
            .optional(),
        },
        async execute(args, context) {
          if (context.agent !== "Manager")
            throw new Error("manager_run is available only to Manager.");
          if (activeManager)
            throw new Error("A Manager workflow is already active.");
          const runConfig = structuredClone(config);
          for (const route of args.routes ?? []) {
            runConfig.models.profiles[route.profile] = {
              mode: "pin",
              pair: {
                providerID: route.providerID,
                modelID: route.modelID,
                ...(route.variant ? { variant: route.variant } : {}),
              },
            };
          }
          const manager = new MinionManager({
            catalog: () => liveCatalog(client, directory),
            permissions: async () => effectiveHostPermissions,
            sessions,
            storage,
            approve: async (request) => {
              await context.ask({
                permission: "minion-manager.approval",
                patterns: [request.nextPhase],
                always: [],
                metadata: { ...request },
              });
              return true;
            },
            emit: () => undefined,
            now: Date.now,
            id: crypto.randomUUID,
            worktree: storageRoot,
            config: runConfig,
          });
          activeManager = manager;
          const cancel = () => void manager.cancelCurrent();
          context.abort.addEventListener("abort", cancel, { once: true });
          try {
            const input = {
              task: args.task,
              parentSessionID: context.sessionID,
            };
            const reviewTarget =
              args.workflow === "review"
                ? (args.target ?? (await detectReviewTarget(storageRoot)))
                : undefined;
            if (args.workflow === "review" && !reviewTarget)
              throw new Error(
                "No reliable review scope was detected; ask the user for a file, directory, commit, range, branch, or PR target.",
              );
            const result =
              args.workflow === "implement"
                ? await manager.implement({
                    ...input,
                    ...(args.risk ? { risk: args.risk } : {}),
                    ...(args.forceAuto === undefined
                      ? {}
                      : { forceAuto: args.forceAuto }),
                  })
                : args.workflow === "review"
                  ? await manager.review({
                      ...input,
                      target: reviewTarget!,
                    })
                  : await manager.research({
                      ...input,
                      ...(args.inquiries?.length
                        ? {
                            inquiries: args.inquiries.map((task) => ({ task })),
                          }
                        : {}),
                      ...(args.reportDestination
                        ? { reportDestination: args.reportDestination }
                        : {}),
                    });
            return {
              title: `Manager · ${args.workflow} · ${result.status}`,
              output:
                result.outputs.join("\n\n") ||
                result.errors.join("\n") ||
                `Run ${result.runID} ended ${result.status}.`,
              metadata: { runID: result.runID, status: result.status },
            };
          } finally {
            context.abort.removeEventListener("abort", cancel);
            if (activeManager === manager) activeManager = undefined;
          }
        },
      }),
      manager_catalog: tool({
        description:
          "List the live policy-filtered model and variant catalog before selecting exact per-profile routes.",
        args: {},
        async execute(_args, context) {
          if (context.agent !== "Manager")
            throw new Error("manager_catalog is available only to Manager.");
          const catalog = (await liveCatalog(client, directory)).filter(
            (model) => {
              const key = `${model.providerID}/${model.modelID}`;
              return (
                !config.models.deny.includes(key) &&
                (!config.models.allow.length ||
                  config.models.allow.includes(key))
              );
            },
          );
          return catalog
            .map(
              (model) =>
                `${model.providerID}/${model.modelID}${model.variants.length ? `#${model.variants.join(",")}` : ""} · ${model.capabilities.join(",")} · context ${model.contextLimit ?? "unknown"} · output ${model.outputLimit ?? "unknown"} · cost ${model.cost ?? "unknown"}`,
            )
            .join("\n");
        },
      }),
      manager_recover: tool({
        description:
          "Revalidate and resume, restart, or abandon an interrupted persisted Manager run.",
        args: {
          runID: tool.schema.string().min(1),
          action: tool.schema.enum(["resume", "restart-phase", "abandon"]),
        },
        async execute(args, context) {
          if (context.agent !== "Manager")
            throw new Error("manager_recover is available only to Manager.");
          const record = (await storage.list()).find(
            (candidate) => candidate.id === args.runID,
          );
          if (!record) throw new Error(`Run ${args.runID} was not found.`);
          if (record.status !== "interrupted")
            throw new Error(
              `Run ${args.runID} is ${record.status}, not interrupted.`,
            );
          if (args.action === "abandon") {
            const machine = new RunMachine(record);
            machine.finish("abandoned", Date.now());
            delete machine.record.recovery;
            await storage.save(machine.record);
            return `Run ${args.runID} was abandoned. Project files and OpenCode sessions were not changed.`;
          }
          if (activeManager)
            throw new Error("A Manager workflow is already active.");
          await git(storageRoot, ["status", "--porcelain"]);
          if (!(await liveCatalog(client, directory)).length)
            throw new Error(
              "Recovery stopped: the live model catalog is empty.",
            );
          if (!effectiveHostPermissions.read)
            throw new Error(
              "Recovery stopped: repository read permission is denied.",
            );
          const manager = new MinionManager({
            catalog: () => liveCatalog(client, directory),
            permissions: async () => effectiveHostPermissions,
            sessions,
            storage,
            approve: async (request) => {
              await context.ask({
                permission: "minion-manager.recovery",
                patterns: [request.nextPhase],
                always: [],
                metadata: { sourceRunID: record.id, ...request },
              });
              return true;
            },
            emit: () => undefined,
            now: Date.now,
            id: crypto.randomUUID,
            worktree: storageRoot,
            config,
          });
          activeManager = manager;
          const cancel = () => void manager.cancelCurrent();
          context.abort.addEventListener("abort", cancel, { once: true });
          try {
            const base = {
              task: record.task,
              parentSessionID: context.sessionID,
            };
            const reviewTarget =
              record.workflow === "review"
                ? await detectReviewTarget(storageRoot)
                : undefined;
            if (record.workflow === "review" && !reviewTarget) {
              throw new Error(
                "Recovery stopped: no dirty changes or merge-base review target could be detected. Start a new review with an explicit target.",
              );
            }
            if (record.workflow === "auto") {
              throw new Error(
                "Recovery stopped: the original auto workflow was not resolved to a principal workflow.",
              );
            }
            const result =
              record.workflow === "implement"
                ? await manager.implement({ ...base, risk: "normal" })
                : record.workflow === "review"
                  ? await manager.review({
                      ...base,
                      target: reviewTarget!,
                    })
                  : await manager.research(base);
            const source = new RunMachine(record);
            source.record.decisions.push(
              `${args.action} revalidated worktree, catalog, permissions, and configuration; continuation run ${result.runID} ended ${result.status}.`,
            );
            source.finish("abandoned", Date.now());
            delete source.record.recovery;
            await storage.save(source.record);
            return {
              title: `Manager recovery · ${result.status}`,
              output: result.outputs.join("\n\n") || result.errors.join("\n"),
              metadata: {
                sourceRunID: record.id,
                continuationRunID: result.runID,
                status: result.status,
              },
            };
          } finally {
            context.abort.removeEventListener("abort", cancel);
            if (activeManager === manager) activeManager = undefined;
          }
        },
      }),
      manager_cancel: tool({
        description:
          "Cancel the active Manager workflow and interrupt all owned Minions without rolling back files.",
        args: {},
        async execute(_args, context) {
          if (context.agent !== "Manager")
            throw new Error("manager_cancel is available only to Manager.");
          const cancelled = await activeManager?.cancelCurrent();
          return cancelled
            ? "Cancellation requested for the active Manager run."
            : "No Manager run is active.";
        },
      }),
      minion_delegate: tool({
        description:
          "Delegate one bounded phase to an exact catalog-validated Minion model pair. Available only to Manager.",
        args: {
          task: tool.schema.string().min(1),
          workflow: tool.schema.enum(["implement", "review", "research"]),
          profile: tool.schema.enum(PROFILES),
          providerID: tool.schema.string().min(1),
          modelID: tool.schema.string().min(1),
          variant: tool.schema.string().min(1).optional(),
          phase: tool.schema.enum([
            "planning",
            "implementing",
            "verifying",
            "reviewing",
            "researching",
            "reporting",
          ]),
          runID: tool.schema.string().min(1).optional(),
          mode: tool.schema.enum(["read", "write"]),
          reportDestination: tool.schema.string().min(1).optional(),
        },
        async execute(args, context) {
          if (context.agent !== "Manager")
            throw new Error(
              "minion_delegate is available only to the Manager agent.",
            );
          if (
            args.mode === "write" &&
            args.profile !== "minion/implement" &&
            args.profile !== "minion/report"
          ) {
            throw new Error(
              `${args.profile} cannot receive write execution mode.`,
            );
          }
          if (
            args.profile === "minion/implement" &&
            (args.workflow !== "implement" || args.mode !== "write")
          ) {
            throw new Error(
              "minion/implement requires the approved Implement workflow and write execution mode; use manager_run for the complete workflow.",
            );
          }
          if (
            args.mode === "write" &&
            args.workflow !== "implement" &&
            args.profile !== "minion/report"
          ) {
            throw new Error(
              "Review and Research workflows cannot acquire implementation write access.",
            );
          }
          if (
            args.profile === "minion/report" &&
            (!args.reportDestination || args.phase !== "reporting")
          ) {
            throw new Error(
              "minion/report requires an explicit reportDestination and reporting phase.",
            );
          }
          if (phaseName(args.profile) !== args.phase) {
            throw new Error(
              `${args.profile} must use the ${phaseName(args.profile)} phase.`,
            );
          }
          const pair = {
            providerID: args.providerID,
            modelID: args.modelID,
            ...(args.variant ? { variant: args.variant } : {}),
          };
          const decision = assertExactPair(
            await liveCatalog(client, directory),
            pair,
            {
              allow: config.models.allow,
              deny: config.models.deny,
              requiredCapabilities: ["text", "tools"],
            },
          );
          const runID = args.runID ?? crypto.randomUUID();
          const machine = new RunMachine(
            createRun(runID, args.workflow, args.task, Date.now()),
          );
          const record = machine.record;
          record.decisions.push(decision.reason);
          machine.startPhase(args.phase, Date.now());
          const phase = record.phases.at(-1)!;
          phase.profile = args.profile;
          phase.model = decision;
          await storage.save(record);
          const lease =
            args.mode === "write"
              ? GLOBAL_WRITER_LEASES.acquire(storageRoot, runID)
              : undefined;
          try {
            const result = await sessions.run(
              {
                runID,
                phase: args.phase,
                task: args.task,
                profile: args.profile,
                pair: decision.pair,
                parentSessionID: context.sessionID,
                mode: args.mode,
                ...(args.reportDestination
                  ? { reportDestination: args.reportDestination }
                  : {}),
              },
              context.abort,
              (sessionID) => {
                owned.add(sessionID);
                phase.childSessionID = sessionID;
              },
            );
            owned.delete(result.sessionID);
            machine.finishPhase(
              "succeeded",
              Date.now(),
              result.output,
              args.phase,
            );
            machine.finish("succeeded", Date.now());
            if (result.usage) record.usage = result.usage;
            await storage.save(record);
            return {
              title: `${args.profile} · ${args.providerID}/${args.modelID}${args.variant ? `#${args.variant}` : ""}`,
              output: result.output,
              metadata: {
                runID,
                childSessionID: result.sessionID,
                model: decision.pair,
              },
            };
          } catch (error) {
            const cancelled = context.abort.aborted;
            machine.finishPhase(
              cancelled ? "cancelled" : "failed",
              Date.now(),
              undefined,
              args.phase,
            );
            record.errors.push(
              error instanceof Error ? error.message : String(error),
            );
            machine.finish(cancelled ? "cancelled" : "failed", Date.now());
            await storage.save(record);
            throw error;
          } finally {
            lease?.release();
          }
        },
      }),
    },
    dispose: async () => {
      await activeManager?.cancelCurrent();
      await Promise.allSettled(
        [...owned].map((sessionID) => sessions.interrupt(sessionID)),
      );
      owned.clear();
    },
  };
};

async function readConfig(path: string): Promise<ConfigInput | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ConfigInput;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(
      `${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function permissionsFromConfig(config: Config): HostPermissions {
  const permission = (
    config as Config & { permission?: Record<string, unknown> }
  ).permission;
  return {
    read: permissionValueAllows(permission?.read),
    web:
      permissionValueAllows(permission?.webfetch) ||
      permissionValueAllows(permission?.websearch),
    shell: permissionValueAllows(permission?.bash),
    edit: permissionValueAllows(permission?.edit),
  };
}

function permissionValueAllows(value: unknown): boolean {
  if (value === "deny") return false;
  if (value === "allow" || value === "ask" || value === undefined) return true;
  if (value && typeof value === "object") {
    const actions = Object.values(value);
    // The core has a capability-level boolean, not enough information to
    // preserve ordered path/command patterns. Be conservative: a patterned
    // host denial disables the capability here and the host remains the final
    // authority for wholly non-denying rules.
    return actions.length > 0 && actions.every((entry) => entry !== "deny");
  }
  return false;
}

async function detectReviewTarget(
  worktree: string,
): Promise<string | undefined> {
  try {
    const status = await git(worktree, ["status", "--porcelain"]);
    if (status.trim()) return "dirty worktree changes";
    const branch = (await git(worktree, ["branch", "--show-current"])).trim();
    if (!branch) return undefined;
    let defaultBranch: string | undefined;
    try {
      defaultBranch = (
        await git(worktree, [
          "symbolic-ref",
          "--short",
          "refs/remotes/origin/HEAD",
        ])
      )
        .trim()
        .replace(/^origin\//, "");
    } catch {
      for (const candidate of ["main", "master"]) {
        try {
          await git(worktree, ["rev-parse", "--verify", candidate]);
          defaultBranch = candidate;
          break;
        } catch {
          // Try the next conventional default branch.
        }
      }
    }
    if (!defaultBranch || defaultBranch === branch) return undefined;
    const mergeBase = (
      await git(worktree, ["merge-base", defaultBranch, "HEAD"])
    ).trim();
    return `${mergeBase}..HEAD`;
  } catch {
    return undefined;
  }
}

async function git(worktree: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: worktree,
    encoding: "utf8",
  });
  return stdout;
}

function phaseName(profile: (typeof PROFILES)[number]) {
  return (
    {
      "minion/plan": "planning",
      "minion/implement": "implementing",
      "minion/review": "reviewing",
      "minion/research": "researching",
      "minion/verify": "verifying",
      "minion/report": "reporting",
    } as const
  )[profile];
}
