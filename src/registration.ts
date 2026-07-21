import type { Config } from "@opencode-ai/plugin";

import { PROFILES, type Profile } from "./core/types.js";

const COORDINATOR_PROMPT = `You are Manager, a pure coordinator. Never edit files or run shell commands yourself.
Classify the user's intent as Implement, Review, or Research; announce Auto selections before any write-capable phase.
Run principal workflows with manager_run so writer leases, approvals, verification, review, persistence, and cancellation are enforced by the headless core. Use minion_delegate only for an explicitly bounded supporting phase with an exact provider/model and optional catalog variant.
For implementation: plan risky work, implement with one writer, verify, independently review, and allow at most two correction cycles.
Review and research remain read-only. Ask before escalating either to implementation. Make every fallback and blocked state visible.`;

const PROFILE_PROMPTS: Record<Profile, string> = {
  "minion/plan":
    "Produce a bounded implementation plan after read-only repository inspection. Do not edit or delegate.",
  "minion/implement":
    "Implement the bounded task. Do not delegate. Respect repository rules and report changed files and checks.",
  "minion/review":
    "Review the given scope read-only. Findings first, ordered by severity, with location, confidence, evidence, impact, and remediation direction. Do not fix findings. End with exactly MINION_MANAGER_BLOCKING: true when actionable blocking findings exist, otherwise MINION_MANAGER_BLOCKING: false.",
  "minion/research":
    "Research the bounded question read-only. Distinguish facts, inferences, uncertainty, disagreement, and recommendations. Cite external claims.",
  "minion/verify":
    "Run only relevant permitted verification commands. Do not edit. Report every check, outcome, and skipped-check reason. End with exactly MINION_MANAGER_BLOCKING: true when any required check fails, otherwise MINION_MANAGER_BLOCKING: false.",
  "minion/report":
    "Write only the explicitly approved Markdown report destination. Do not modify any other file and do not delegate.",
};

function minionPermissions(profile: Profile) {
  const canImplement = profile === "minion/implement";
  const canVerify = profile === "minion/verify";
  const canReport = profile === "minion/report";
  return {
    edit: canImplement || canReport ? "ask" : "deny",
    bash: canImplement || canVerify ? "ask" : "deny",
    webfetch: profile === "minion/research" ? "ask" : "deny",
  } as const;
}

export function registerConfig(config: Config): void {
  config.agent ??= {};
  config.agent.Manager = {
    description: "Coordinate safe Minion workflows without doing concrete work",
    mode: "primary",
    prompt: COORDINATOR_PROMPT,
    color: "#A78BFA",
    tools: {
      write: false,
      edit: false,
      bash: false,
      task: false,
      minion_delegate: true,
      manager_run: true,
      manager_cancel: true,
      manager_catalog: true,
      manager_recover: true,
    },
    permission: { edit: "deny", bash: "deny", webfetch: "deny" },
  };
  for (const profile of PROFILES) {
    config.agent[profile] = {
      description: PROFILE_PROMPTS[profile],
      mode: "subagent",
      prompt: PROFILE_PROMPTS[profile],
      tools: { task: false, minion_delegate: false },
      permission: minionPermissions(profile),
    };
  }

  config.command ??= {};
  Object.assign(config.command, {
    manager: {
      template:
        "Open Manager mode and ask me to choose Auto, Implement, Review, or Research before acting.",
      description: "Choose a persistent Manager workflow",
      agent: "Manager",
    },
    "manager/implement": {
      template: "Run a one-shot Implement workflow for: $ARGUMENTS",
      description: "Implement, verify, and independently review",
      agent: "Manager",
    },
    "manager/review": {
      template: "Run a one-shot read-only Review workflow for: $ARGUMENTS",
      description: "Review a target without editing",
      agent: "Manager",
    },
    "manager/research": {
      template: "Run a one-shot Research workflow for: $ARGUMENTS",
      description: "Research with evidence",
      agent: "Manager",
    },
    "manager/settings": {
      template:
        "Show the effective Minion Manager settings and actionable validation diagnostics.",
      description: "Inspect Manager settings",
      agent: "Manager",
    },
    "manager/history": {
      template: "Show recent Minion Manager run metadata and recovery choices.",
      description: "Inspect Manager run history",
      agent: "Manager",
    },
    "manager/cancel": {
      template:
        "Call manager_cancel to cancel the current Manager run and interrupt every owned Minion. Do not roll back files.",
      description: "Cancel the active Manager run",
      agent: "Manager",
    },
    "manager/off": {
      template: "Disable persistent Manager mode for this session.",
      description: "Leave Manager mode",
      agent: "Manager",
    },
  });
}
