import type { RoutingPolicy } from "./config.js";
import { permissionsFor } from "./permissions.js";
import type {
  ManagerPorts,
  MinionRequest,
  MinionResult,
  RunInput,
  WorkflowResult,
} from "./ports.js";
import { assertExactPair, routeModel } from "./routing.js";
import { RunMachine, WriterLeases } from "./state.js";
import {
  createRun,
  type ModelDecision,
  type ModelPair,
  type PhaseName,
  type Profile,
  type Workflow,
} from "./types.js";

export const GLOBAL_WRITER_LEASES = new WriterLeases();

export interface ResearchInput extends RunInput {
  inquiries?: Array<{ task: string; pair?: ModelPair }>;
  reportDestination?: string;
}

export interface ReviewInput extends RunInput {
  target?: string;
  pair?: ModelPair;
}

export interface ImplementInput extends RunInput {
  risk?: "trivial" | "normal" | "complex" | "destructive";
  forceAuto?: boolean;
  pair?: ModelPair;
}

interface ActiveRun {
  machine: RunMachine;
  controller: AbortController;
  children: Set<string>;
}

export class MinionManager {
  private active: ActiveRun | undefined;

  constructor(private readonly ports: ManagerPorts) {}

  async research(input: ResearchInput): Promise<WorkflowResult> {
    const active = await this.begin(
      "research",
      input.task,
      input.parentSessionID,
    );
    try {
      const inquiries = (
        input.inquiries?.length ? input.inquiries : [{ task: input.task }]
      ).slice(0, this.ports.config.limits.readers);
      const outputs: string[] = [];
      for (
        let offset = 0;
        offset < inquiries.length;
        offset += this.ports.config.limits.readers
      ) {
        const batch = inquiries.slice(
          offset,
          offset + this.ports.config.limits.readers,
        );
        const results = await Promise.all(
          batch.map((inquiry) =>
            this.executePhase(
              active,
              "researching",
              "minion/research",
              inquiry.task,
              input.parentSessionID,
              "read",
              inquiry.pair,
            ),
          ),
        );
        outputs.push(...results.map((result) => result.output));
      }
      if (input.reportDestination) {
        const result = await this.executePhase(
          active,
          "reporting",
          "minion/report",
          `Write the requested research report to ${input.reportDestination}.\n\n${outputs.join("\n\n")}`,
          input.parentSessionID,
          "write",
          undefined,
          input.reportDestination,
        );
        outputs.push(result.output);
      }
      return await this.complete(active, "succeeded", outputs);
    } catch (error) {
      return this.fail(active, error);
    }
  }

  async review(input: ReviewInput): Promise<WorkflowResult> {
    const active = await this.begin(
      "review",
      input.task,
      input.parentSessionID,
    );
    try {
      const task = input.target
        ? `${input.task}\nReview target: ${input.target}`
        : input.task;
      const result = await this.executePhase(
        active,
        "reviewing",
        "minion/review",
        task,
        input.parentSessionID,
        "read",
        input.pair,
      );
      return await this.complete(
        active,
        result.blocking ? "partial" : "succeeded",
        [result.output],
      );
    } catch (error) {
      return this.fail(active, error);
    }
  }

  async implement(input: ImplementInput): Promise<WorkflowResult> {
    const active = await this.begin(
      "implement",
      input.task,
      input.parentSessionID,
    );
    const outputs: string[] = [];
    let lease: ReturnType<WriterLeases["acquire"]> | undefined;
    try {
      const needsPlan = input.risk !== undefined && input.risk !== "trivial";
      if (needsPlan) {
        const plan = await this.executePhase(
          active,
          "planning",
          "minion/plan",
          input.task,
          input.parentSessionID,
          "read",
          input.pair,
        );
        outputs.push(plan.output);
        if (!input.forceAuto && this.ports.config.approvals !== "never") {
          const approved = await this.ports.approve({
            runID: active.machine.record.id,
            nextPhase: "implementing",
            profile: "minion/implement",
            reason: `The task is ${input.risk}; review the Minion plan before writing.`,
            budgetEffect: "No reliable additional cost estimate is available.",
          });
          if (!approved)
            return await this.complete(active, "cancelled", outputs);
        }
      }

      lease = GLOBAL_WRITER_LEASES.acquire(
        this.ports.worktree,
        active.machine.record.id,
      );
      let implementation = await this.executePhase(
        active,
        "implementing",
        "minion/implement",
        needsPlan
          ? `${input.task}\n\nAccepted plan:\n${outputs.at(-1)}`
          : input.task,
        input.parentSessionID,
        "write",
        input.pair,
      );
      outputs.push(implementation.output);
      const implementationSessionID = implementation.sessionID;

      while (true) {
        const verification = await this.executePhase(
          active,
          "verifying",
          "minion/verify",
          `Verify the implementation for: ${input.task}`,
          input.parentSessionID,
          "read",
        );
        outputs.push(verification.output);
        const review = await this.executePhase(
          active,
          "reviewing",
          "minion/review",
          `Independently review the resulting diff against this task: ${input.task}`,
          input.parentSessionID,
          "read",
        );
        outputs.push(review.output);
        if (!verification.blocking && !review.blocking) break;
        if (
          active.machine.record.correctionCount >=
          this.ports.config.limits.corrections
        ) {
          return await this.complete(active, "partial", outputs);
        }
        active.machine.record.correctionCount += 1;
        implementation = await this.executePhase(
          active,
          "implementing",
          "minion/implement",
          `Correct the implementation for ${input.task}.\nVerification: ${verification.output}\nReview: ${review.output}`,
          input.parentSessionID,
          "write",
          input.pair,
          undefined,
          implementationSessionID,
        );
        outputs.push(implementation.output);
      }
      return await this.complete(active, "succeeded", outputs);
    } catch (error) {
      return this.fail(active, error);
    } finally {
      lease?.release();
    }
  }

  async cancelCurrent(): Promise<boolean> {
    const active = this.active;
    if (!active) return false;
    active.controller.abort();
    await Promise.allSettled(
      [...active.children].map((sessionID) =>
        this.ports.sessions.interrupt(sessionID),
      ),
    );
    return true;
  }

  async recoverInterrupted(): Promise<number> {
    const records = await this.ports.storage.list();
    let count = 0;
    for (const record of records) {
      if (["pending", "running", "waiting"].includes(record.status)) {
        const machine = new RunMachine(record);
        machine.interrupt(
          this.ports.now(),
          "OpenCode restarted while the run was active.",
        );
        await this.ports.storage.save(machine.record);
        count += 1;
      }
    }
    return count;
  }

  private async begin(
    workflow: Workflow,
    task: string,
    managerSessionID: string,
  ): Promise<ActiveRun> {
    if (this.active)
      throw new Error(
        `Run ${this.active.machine.record.id} is already active.`,
      );
    const machine = new RunMachine(
      createRun(this.ports.id(), workflow, task, this.ports.now()),
    );
    machine.record.managerSessionID = managerSessionID;
    const active = {
      machine,
      controller: new AbortController(),
      children: new Set<string>(),
    };
    this.active = active;
    machine.record.status = "running";
    await this.ports.storage.save(machine.record);
    this.ports.emit({
      type: "run.started",
      runID: machine.record.id,
      at: this.ports.now(),
      workflow,
    });
    return active;
  }

  private async executePhase(
    active: ActiveRun,
    phase: PhaseName,
    profile: Profile,
    task: string,
    parentSessionID: string,
    mode: "read" | "write",
    requestedPair?: ModelPair,
    reportDestination?: string,
    resumeSessionID?: string,
  ): Promise<MinionResult> {
    if (active.controller.signal.aborted)
      throw new DOMException("Aborted", "AbortError");
    const host = await this.ports.permissions();
    const effective = permissionsFor(profile, host, reportDestination);
    if (!effective.read || (mode === "write" && !effective.edit))
      throw new Error(`${profile} is not permitted to ${mode}.`);
    const catalog = await this.ports.catalog();
    const policy: RoutingPolicy = requestedPair
      ? { mode: "pin", pair: requestedPair }
      : (this.ports.config.models.profiles[profile] ?? { mode: "auto" });
    const decision = requestedPair
      ? assertExactPair(catalog, requestedPair, this.modelRules())
      : routeModel(catalog, policy, this.modelRules());
    await this.approveBudget(active, profile, decision);
    active.machine.startPhase(phase, this.ports.now());
    const phaseRecord = active.machine.record.phases.at(-1)!;
    phaseRecord.profile = profile;
    phaseRecord.model = decision;
    if (decision.fallback) {
      active.machine.record.decisions.push(decision.reason);
      this.ports.emit({
        type: "routing.fallback",
        runID: active.machine.record.id,
        at: this.ports.now(),
        workflow: active.machine.record.workflow,
        phase,
        profile,
        model: decision.pair,
        message: decision.reason,
      });
    }
    await this.ports.storage.save(active.machine.record);
    this.ports.emit({
      type: "phase.started",
      runID: active.machine.record.id,
      at: this.ports.now(),
      workflow: active.machine.record.workflow,
      phase,
      profile,
      model: decision.pair,
    });
    const request: MinionRequest = {
      runID: active.machine.record.id,
      phase,
      task,
      profile,
      pair: decision.pair,
      parentSessionID,
      mode,
      ...(reportDestination ? { reportDestination } : {}),
      ...(resumeSessionID ? { resumeSessionID } : {}),
    };
    let attempts = 0;
    while (true) {
      try {
        const result = await this.ports.sessions.run(
          request,
          active.controller.signal,
          (sessionID) => {
            active.children.add(sessionID);
            phaseRecord.childSessionID = sessionID;
          },
        );
        active.children.delete(result.sessionID);
        if (result.usage) {
          const usage = (active.machine.record.usage ??= {});
          if (result.usage.inputTokens !== undefined)
            usage.inputTokens =
              (usage.inputTokens ?? 0) + result.usage.inputTokens;
          if (result.usage.outputTokens !== undefined)
            usage.outputTokens =
              (usage.outputTokens ?? 0) + result.usage.outputTokens;
          if (result.usage.cost !== undefined)
            usage.cost = (usage.cost ?? 0) + result.usage.cost;
        }
        active.machine.finishPhase(
          "succeeded",
          this.ports.now(),
          result.output,
          phase,
        );
        await this.ports.storage.save(active.machine.record);
        this.ports.emit({
          type: "phase.finished",
          runID: active.machine.record.id,
          at: this.ports.now(),
          workflow: active.machine.record.workflow,
          phase,
          profile,
          model: decision.pair,
        });
        return result;
      } catch (error) {
        const transient = isTransient(error);
        if (transient && attempts++ === 0 && !active.controller.signal.aborted)
          continue;
        active.machine.finishPhase(
          active.controller.signal.aborted ? "cancelled" : "failed",
          this.ports.now(),
          undefined,
          phase,
        );
        throw error;
      }
    }
  }

  private modelRules() {
    return {
      allow: this.ports.config.models.allow,
      deny: this.ports.config.models.deny,
      requiredCapabilities: ["text", "tools"],
      budget: this.ports.config.limits.budget,
    };
  }

  private async approveBudget(
    active: ActiveRun,
    profile: Profile,
    decision: ModelDecision,
  ): Promise<void> {
    const budget = this.ports.config.limits.budget;
    if (
      budget === null ||
      decision.cost === undefined ||
      decision.cost <= budget
    )
      return;
    const approved = await this.ports.approve({
      runID: active.machine.record.id,
      nextPhase: profile.replace("minion/", ""),
      profile,
      pair: decision.pair,
      reason: `Known model cost ${decision.cost} exceeds configured budget ${budget}.`,
      budgetEffect: `${decision.cost} > ${budget}`,
    });
    if (!approved) throw new Error("Budget approval was declined.");
  }

  private async complete(
    active: ActiveRun,
    status: "succeeded" | "partial" | "cancelled",
    outputs: string[],
  ): Promise<WorkflowResult> {
    active.machine.finish(status, this.ports.now());
    await this.ports.storage.save(active.machine.record);
    this.ports.emit({
      type: "run.finished",
      runID: active.machine.record.id,
      at: this.ports.now(),
      workflow: active.machine.record.workflow,
      status,
    });
    if (this.active === active) this.active = undefined;
    return this.result(active, outputs);
  }

  private async fail(
    active: ActiveRun,
    error: unknown,
  ): Promise<WorkflowResult> {
    const cancelled =
      active.controller.signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError");
    const message = error instanceof Error ? error.message : String(error);
    active.machine.record.errors.push(message);
    active.machine.finish(cancelled ? "cancelled" : "failed", this.ports.now());
    await this.ports.storage.save(active.machine.record);
    this.ports.emit({
      type: cancelled ? "run.finished" : "run.error",
      runID: active.machine.record.id,
      at: this.ports.now(),
      workflow: active.machine.record.workflow,
      status: active.machine.record.status,
      message,
    });
    if (this.active === active) this.active = undefined;
    return this.result(active, []);
  }

  private result(active: ActiveRun, outputs: string[]): WorkflowResult {
    return {
      runID: active.machine.record.id,
      workflow: active.machine.record.workflow,
      status: active.machine.record.status,
      outputs,
      errors: [...active.machine.record.errors],
      record: structuredClone(active.machine.record),
    };
  }
}

function isTransient(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /(?:timeout|rate.?limit|temporar|503|connection reset)/i.test(
    error.message,
  );
}
