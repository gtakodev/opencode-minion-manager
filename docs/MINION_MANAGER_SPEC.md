# Minion Manager — V1 Product and Technical Specification

Status: approved for implementation planning  
Product name: **Minion Manager**  
npm package: `opencode-minion-manager`  
Plugin ID: `opencode.minion-manager`  
License: MIT

## Problem Statement

OpenCode users can define primary agents and subagents, but coordinating them for a complete engineering outcome still requires repeated manual choices: decomposing the work, selecting an appropriate model and reasoning variant, delegating safely, verifying results, requesting an independent review, handling failures, and understanding what is running.

The user needs a lightweight, OpenCode-native orchestration layer that makes these choices visible and controllable without creating a separate mission-control product. It must work in both OpenCode Desktop and the terminal, prioritize Linux and Windows, remain compatible by design with macOS, and preserve the user's existing provider and permission configuration.

The experience must feel native to the Anomaly/OpenCode ecosystem: concise terminology, restrained pixel-art motion inspired by Kit Langton's “Liquid Crown” study, a rich TUI where OpenTUI supports it, and no ornamental custom surface in Desktop.

## Solution

Minion Manager adds one selectable OpenCode `primary` agent named `Manager`. The Manager is a pure coordinator: it interprets the task, selects or confirms a principal workflow, chooses suitable models and model-specific variants from the live OpenCode catalog, and invokes specialized child-session `subagent` profiles called Minions.

V1 provides four entry choices:

- `Auto`: the Manager selects the principal workflow.
- `Implement`: implement a ticket or described change, verify it, and obtain an independent review.
- `Review`: inspect a requested or automatically detected change scope without editing it.
- `Research`: investigate the codebase, external primary sources, or both, then synthesize evidence and recommendations.

The Manager may invoke a different read-only workflow as a supporting sub-workflow. Escalating from a read-only workflow to `Implement` requires explicit user approval unless the user invoked `Implement` directly.

The terminal receives the complete UX: a `/manager` picker, command-palette action, configurable key binding, animated status band above the composer, settings UI, history UI, and interruption recovery. Desktop uses OpenCode's native agent selector and commands, plus the shared orchestration state. A dedicated Desktop settings panel is deferred until OpenCode exposes a suitable stable extension point.

## Goals and Success Criteria

1. A user can select a workflow and delegate a task without manually creating or supervising child sessions.
2. Each Minion runs with an explicitly validated `provider/model#variant` pair or with a visible, policy-compliant fallback.
3. The Manager never edits files or performs implementation work itself.
4. A normal implementation run ends with verification and an independent review, or a precise explanation of why it could not.
5. Read-only workflows cannot silently acquire write access.
6. The active workflow, phase, Minion profile, model, variant, progress, wait state, failure, and fallback are inspectable.
7. The plugin works with zero configuration and remains useful with a small terminal.
8. Plugin failures do not prevent unrelated OpenCode plugins or normal OpenCode usage.
9. Linux and Windows receive release-blocking validation; macOS receives CI and design compatibility until native hardware is available.

## Domain Language

- **Manager**: the `primary` OpenCode agent that coordinates work but does not perform concrete work.
- **Minion**: a specialized OpenCode `subagent` running in a child session.
- **Workflow**: the user-visible orchestration intent: `Auto`, `Implement`, `Review`, or `Research`.
- **Profile**: the Minion role applied to a child session: `minion/plan`, `minion/implement`, `minion/review`, `minion/research`, `minion/verify`, or `minion/report`.
- **Run**: one orchestration started by a user prompt or direct Manager command.
- **Phase**: one state within a run, such as planning, implementing, verifying, or reviewing.
- **Model pair**: an exact OpenCode provider/model and optional catalog-defined variant.
- **Routing policy**: `Auto`, `Prefer`, or `Pin` for selecting a model pair for a Minion profile.
- **Correction cycle**: reuse of the implementation Minion to address failed verification or review findings, followed by renewed checks.
- **Read-only escalation**: a transition from `Review` or `Research` into a workflow that can edit files.

## User Stories

1. As an OpenCode user, I want to select Manager as a primary agent, so that orchestration feels like a native agent mode.
2. As a terminal user, I want `/manager` to open a visual workflow picker, so that I do not need to memorize commands.
3. As a keyboard-oriented user, I want the Manager picker in the command palette and on a configurable shortcut, so that it is fast to reach.
4. As a user, I want to select `Auto`, so that the Manager can classify an ambiguous task for me.
5. As a user, I want to select `Implement`, so that a ticket can move from understanding to verified code.
6. As a user, I want to select `Review`, so that I receive findings without unexpected edits.
7. As a user, I want to select `Research`, so that I receive an evidence-backed answer rather than implementation work.
8. As a user, I want my workflow selection to remain active for the current session, so that follow-up prompts are natural.
9. As a user, I want `/manager/off` to restore ordinary OpenCode behavior, so that orchestration is never sticky or confusing.
10. As a user, I want direct workflow commands to be one-shot, so that they do not unexpectedly change my persistent session mode.
11. As a user, I want a subtle status band above the composer, so that I always know when Manager mode is active.
12. As a user, I want the status band to show workflow, progress, active profile, model, and variant, so that delegation remains transparent.
13. As a user, I want full, reduced, and disabled motion modes, so that the interface respects my comfort and terminal capabilities.
14. As a user, I want portable pixel-art icons with text labels, so that the picker remains readable without Nerd Fonts or emoji-width assumptions.
15. As a user, I want the Manager to inherit the model selected in the parent chat, so that my primary model choice remains meaningful.
16. As a user, I want each Minion to use a task-appropriate model and reasoning variant, so that simple work does not consume the same resources as difficult planning.
17. As a user, I want the Manager to read the live model catalog, so that the plugin does not hardcode model or variant names.
18. As a user, I want to allow or exclude models, so that routing respects my provider, policy, and cost constraints.
19. As a user, I want `Auto`, `Prefer`, and `Pin` routing modes per Minion profile, so that I can choose between autonomy and determinism.
20. As a user, I want an unavailable pinned model to stop with a clear explanation, so that it is never silently replaced.
21. As a user, I want a transient model failure retried once before fallback, so that momentary provider errors do not derail a run.
22. As a user, I want every fallback displayed and recorded, so that I know which model actually performed the work.
23. As a cost-conscious user, I want warnings before a known budget is exceeded, so that delegation remains economically controlled.
24. As a user, I do not want fabricated cost estimates, so that unknown provider pricing is represented honestly.
25. As a user implementing a small change, I want the Manager to skip unnecessary planning, so that simple work remains fast.
26. As a user implementing risky or complex work, I want the Manager to pause after planning, so that I can approve the direction before edits.
27. As an advanced user, I want to force an automatic run, so that I can remove approval pauses when I accept the risk.
28. As a user, I want concrete work delegated to Minions, so that the Manager remains focused on coordination.
29. As a user, I want only one writer active at a time, so that concurrent Minions cannot corrupt the same worktree.
30. As a user, I want up to three read-only Minions to work concurrently, so that research and inspection can be faster.
31. As a user, I want implementation verification, so that compilation, tests, linting, or relevant project checks are not omitted.
32. As a user, I want an independent review Minion with fresh context, so that it is not biased by the implementer's hidden reasoning.
33. As a user, I want the reviewer to receive the task, diff, and repository rules, so that its findings remain grounded.
34. As a user, I want up to two automatic correction cycles, so that ordinary verification and review findings can be resolved without repetitive supervision.
35. As a user, I want corrections sent back to the existing implementation session, so that the implementer retains useful context.
36. As a user, I want the final result to distinguish success, partial success, cancellation, and failure, so that run outcomes are unambiguous.
37. As a reviewer, I want explicit scopes to override automatic detection, so that I can review a file, directory, commit, range, branch, or PR precisely.
38. As a reviewer without an explicit target, I want dirty worktree changes reviewed first, so that current work is the intuitive default.
39. As a reviewer with a clean worktree, I want the current branch compared with the default branch merge-base, so that committed work is still discoverable.
40. As a reviewer, I want findings ordered by severity with location, confidence, evidence, and remediation direction, so that the report is actionable.
41. As a reviewer, I want review to remain read-only unless I explicitly request implementation, so that inspection cannot mutate my code.
42. As a researcher, I want the Manager to classify research as codebase, external, or mixed, so that the investigation method fits the question.
43. As a researcher, I want independent read-only Minions to investigate in parallel when useful, so that one line of inquiry does not dominate prematurely.
44. As a researcher, I want facts separated from inferences and uncertainty, so that I can judge the strength of the conclusion.
45. As a researcher, I want citations for external claims, so that I can verify the evidence.
46. As a researcher, I want the answer in chat by default, so that routine research does not create repository clutter.
47. As a researcher, I want an optional Markdown report only when requested, so that durable research can be saved intentionally.
48. As a user, I want settings presented in a native TUI interface, so that common configuration does not require manual JSON editing.
49. As a user, I want settings grouped into Models, Limits, Approvals, Workflows, and Appearance, so that the interface stays understandable.
50. As a user, I want to choose whether a setting is global or project-specific, so that team conventions can differ from personal defaults.
51. As a user, I want model and variant choices validated immediately, so that configuration errors are found before a run.
52. As a new user, I want a dismissible first-run assistant, so that zero-config behavior and optional guardrails are easy to understand.
53. As a user, I want invalid configuration to disable only Minion Manager with a clear diagnostic, so that OpenCode itself remains usable.
54. As a user, I want a history of the latest 50 project runs, so that I can inspect or recover recent orchestration.
55. As a privacy-conscious user, I do not want Minion Manager to duplicate OpenCode transcripts, so that it stores only necessary orchestration metadata.
56. As a user returning after a restart, I want interrupted runs marked rather than silently resumed, so that no Minion acts without renewed intent.
57. As a returning user, I want to resume, restart the interrupted phase, or abandon a run, so that recovery matches the state of my worktree.
58. As a user cancelling a run, I want the Manager and active Minions interrupted without automatic rollback, so that my existing and partial work is not destructively rewritten.
59. As a user, I want cancellation to preserve an inspectable run record, so that I can decide whether to resume later.
60. As a user, I want read-only supporting workflows to run without needless approval, so that orchestration remains fluid.
61. As a user, I want confirmation before a read-only run escalates into editing, so that permission changes are explicit.
62. As an OpenCode administrator, I want Minion Manager to narrow but never elevate configured permissions, so that plugin policy cannot bypass host policy.
63. As a Windows user, I want paths, child sessions, persistence, icons, and key handling to work natively, so that WSL is not required.
64. As a Linux user, I want release-blocking TUI end-to-end coverage, so that the primary terminal experience remains reliable.
65. As a future macOS user, I want the design and CI to remain portable, so that native validation can be added without redesign.
66. As a plugin maintainer, I want OpenCode compatibility declared and tested, so that V2 beta changes cause explicit releases rather than silent breakage.
67. As a contributor, I want a small headless core separated from OpenCode and OpenTUI adapters, so that behavior can be tested without rendering or live providers.
68. As a user, I want no Minion Manager telemetry and no third-party relay, so that prompts only reach providers already configured in OpenCode.
69. As a support user, I want an opt-in debug mode with secret redaction, so that failures can be diagnosed safely.
70. As a user of a narrow terminal, I want labels and critical status to degrade gracefully, so that the interface never depends on a wide layout.

## Implementation Decisions

### Package architecture

- The package is a TypeScript ESM package with no native runtime dependency.
- It exposes an OpenCode V2 server plugin and a separate OpenTUI plugin entrypoint from the same npm package.
- The server and TUI adapters share a headless domain core containing configuration, routing, workflow state transitions, persistence contracts, policies, and event types.
- The OpenCode boundary uses the Promise-based V2 API for a smaller public dependency surface. Structured cancellation is implemented with `AbortSignal` and explicit resource ownership. The choice may be revisited if an Effect-only OpenCode capability becomes necessary.
- The TUI adapter uses the supported OpenTUI/Solid plugin APIs for routes, dialogs, keymaps, slots, theme access, client access, and lifecycle cleanup.
- No workflow rule depends on a TUI component. Desktop and terminal observe the same run state.
- All OpenCode-facing capability access is isolated behind an adapter because the V2 API is beta.

### OpenCode registrations

- Register `Manager` as a visible `primary` agent.
- Register `minion/plan`, `minion/implement`, `minion/review`, `minion/research`, `minion/verify`, and `minion/report` as `subagent` profiles.
- The Manager is denied edit and shell operations. Its concrete-work capability is limited to the Minion delegation tool, coordination state, and user approval interactions.
- Minion profiles cannot recursively orchestrate or launch arbitrary subagents.
- Register `/manager`, `/manager/settings`, `/manager/history`, and `/manager/off` as native TUI actions that never submit an LLM prompt. Register `/manager/implement`, `/manager/review`, `/manager/research`, and `/manager/cancel` as server-side model commands where the host surface supports them.
- `/manager/implement`, `/manager/review`, and `/manager/research` are one-shot invocations. `/manager` changes the current session's persistent Manager mode.

### Dynamic Minion delegation

- Add a plugin-defined delegation tool available only to the Manager.
- The tool accepts a bounded task, workflow/profile, exact provider/model, optional exact variant, run/phase identity, and execution mode.
- Before creating a child session, the tool validates the selected model and variant against the live enabled catalog and Minion Manager policy.
- The tool creates a child session related to the Manager session and prompts it with the selected profile, explicit model, and variant. The session—not a global agent mutation—owns the selected model pair.
- The tool reports structured lifecycle events to the run store and a concise textual result to the Manager.
- The plugin does not create a static agent for every model/variant combination and does not mutate shared agent definitions between invocations.
- The model identifiers “Luna” and “Sol” are examples of routing intent only. No model or variant name is hardcoded as a universal default.

### Model routing

- The Manager inherits the parent chat's selected model and variant for its own reasoning.
- The Manager receives a compact, policy-filtered view of enabled models, variants, capabilities, context/output limits, and available price metadata.
- Routing considers profile, task complexity, required tools, model capabilities, user allow/deny rules, price constraints, and availability.
- Each Minion profile supports `Auto`, `Prefer`, or `Pin`.
- `Auto` lets the Manager select any allowed catalog pair.
- `Prefer` tries a configured pair first and permits controlled fallback.
- `Pin` requires the exact configured pair and fails visibly if it is unavailable.
- A chosen pair is validated, retried once for a transient failure, then returned to the Manager for an alternative selection.
- A fallback is never replaced by the chat default silently. It is displayed and persisted with a short reason.
- A fallback that exceeds a known budget or violates a configured preference requires approval. A fallback can never violate an explicit allow/deny or permission boundary.

### Permission profiles

- Minion Manager never grants a capability denied by the effective OpenCode user/project configuration.
- `Manager`: coordination and delegation only; no concrete file editing or shell work.
- `minion/plan`: read-only repository inspection; no edits.
- `minion/review`: read-only repository and diff inspection; no edits.
- `minion/research`: repository read plus web research when allowed; no edits.
- `minion/verify`: repository read plus the minimum verification shell commands permitted by OpenCode; no edits.
- `minion/implement`: editing and shell access constrained by existing OpenCode permissions; only one active writer per worktree.
- `minion/report`: read plus write access only for the explicitly requested report destination.
- Child permissions are declared on the child profile and additionally checked by Minion Manager policy because OpenCode child sessions use their own configured permissions.

### Workflow selection and escalation

- The `/manager` picker contains `Auto`, `Implement`, `Review`, and `Research` in that order.
- The user must make an explicit picker selection; `Auto` is visually first but not silently chosen.
- The selected workflow remains active for the current OpenCode session until changed or disabled.
- A principal workflow may invoke read-only supporting workflows without approval.
- Moving from `Review` or `Research` to `Implement` requires approval.
- A direct `/manager/implement` invocation is itself approval to use the implementation workflow, subject to OpenCode's normal permissions.
- `Auto` announces its selected workflow before the first write-capable phase.

### Implement workflow

- The workflow first determines task scope, constraints, repository rules, risk, and whether a plan is useful.
- Trivial, low-risk work may go directly to `minion/implement`.
- Complex, ambiguous, broad, destructive, security-sensitive, migration, dependency, or architecture work invokes `minion/plan` and pauses for approval under the adaptive approval policy.
- The implementation Minion receives the accepted task and plan, not unrestricted orchestration authority.
- `minion/verify` runs the most relevant available checks and reports what ran, what could not run, and why.
- A fresh `minion/review` receives the original task, repository rules, and resulting diff, but not the implementer's hidden reasoning.
- Failed verification or actionable review findings may start a correction cycle in the existing implementation session.
- Each correction cycle is followed by renewed verification and review of the updated result.
- At most two automatic correction cycles are allowed by default. The Manager then pauses with remaining failures and options.
- Completion requires either successful relevant checks and no blocking review findings, or an explicit partial/blocked outcome explaining gaps.

### Review workflow

- An explicit file, directory, commit, range, branch, or PR target always wins.
- Without an explicit target, review dirty worktree changes.
- If the worktree is clean, compare the current branch with the merge-base of the detected default branch.
- If no reliable target exists, request one rather than guessing.
- Findings are ordered by severity and include location, confidence, evidence, impact, and remediation direction.
- Review reports findings before summaries. “No findings” is stated explicitly, with residual test or coverage gaps.
- Standalone review never fixes findings unless the user explicitly escalates to `Implement`.

### Research workflow

- Classify the task as codebase, external, or mixed research.
- Use one Minion for narrow questions and up to three independent read-only Minions for separable lines of inquiry.
- Prefer primary and authoritative external sources.
- Synthesis distinguishes observed facts, source-backed conclusions, inferences, uncertainties, disagreements, and recommendations.
- External claims include direct citations.
- The default deliverable is a chat response.
- `minion/report` writes a Markdown report only when the user explicitly requests a saved artifact and names or accepts the destination.

### Concurrency and worktrees

- Permit at most three concurrent read-only Minions by default.
- Permit at most one active writer per worktree.
- Scheduling is fair within a run and cancellable.
- V1 does not create isolated git worktrees for parallel writers.
- The architecture leaves the writer lease keyed by worktree identity so isolated parallel writers can be added later without changing workflow semantics.

### Approval policy

- Default policy is adaptive.
- Require approval after plans for complex or risky changes, before read-only-to-write escalation, before a known budget overrun, and before a materially more expensive fallback.
- Allow low-risk read-only phases and trivial, explicitly requested implementation work to continue without extra approval.
- Offer a per-run force-auto control that removes Minion Manager's optional pauses but never bypasses OpenCode permissions.
- Approval requests state the next phase, writer profile, model pair, known budget effect, and reason for pausing.

### Run state and persistence

- Model each run as an explicit state machine with terminal states `succeeded`, `partial`, `failed`, `cancelled`, and `abandoned`.
- Persist workflow, initial task reference, Manager decisions, model pairs and short reasons, child session IDs, phase states, results, errors, correction count, timestamps, and available usage metrics.
- Do not duplicate OpenCode message transcripts or hidden reasoning.
- Retain the latest 50 runs per project by default.
- Mark active runs interrupted when the plugin or host restarts. Never auto-resume them.
- Offer `Resume`, `Restart phase`, and `Abandon` after interruption.
- Resume always revalidates worktree state, catalog availability, permissions, and configuration before launching a new child action.
- Persistence writes are atomic and versioned. Unknown future fields are tolerated; unsupported schema versions fail with a diagnostic rather than destructive migration.

### Cancellation

- `Escape` through the host interrupt path and `/manager/cancel` cancel the current Manager run and all active Minions owned by it.
- Cancellation is cooperative first and uses OpenCode session interruption.
- Never perform automatic git reset, checkout, file deletion, or rollback.
- Preserve existing and partially written files and record the run as cancelled.
- A later resume begins with worktree revalidation and a summary of partial state.

### Configuration

- Zero configuration produces a useful and conservative default experience.
- Support global and project configuration; project values override global values.
- Plugin entry options may provide non-interactive overrides and have explicit documented precedence.
- Settings cover model allow/deny policy, per-profile routing, known run budgets, concurrency, correction cycles, approvals, history limit, motion, and appearance.
- Configuration is schema-versioned and validated at activation and before save.
- An invalid configuration disables Minion Manager for the affected scope/session and surfaces one actionable diagnostic. It must not block unrelated OpenCode functionality.
- The settings TUI edits only Minion Manager-owned configuration and offers scope selection, immediate validation, save confirmation, and restore defaults.

### Cost policy

- Display provider-reported token/usage and cost data when available.
- Known budget thresholds warn before overrun and require approval to continue.
- A hard monetary cap is enforceable only when the provider supplies sufficiently reliable pricing and usage metadata.
- When price is unknown, display `unknown` and enforce allow/deny policy, profile routing, concurrency, retries, and step/correction limits instead.

### TUI experience

- `/manager` opens a native large dialog; it does not insert a slash command into the prompt.
- The picker uses four color-coded cards with code-drawn pixel-art glyphs built from width-stable block and geometric characters. Every icon has a text label and description.
- Picker, ready, approval, terminal, and error states remain still. A width-stable local glyph animates only while a Manager or Minion is actively doing work; no surrounding layout moves and no per-cell full-screen shader is used.
- The visual motion language is inspired by Kit Langton's “Liquid Crown”: breathing, glimmer, handoff, and short state transitions rather than continuous spectacle.
- Motion modes are `full`, `reduced`, and `off`.
- A compact status band sits above the session composer. Representative content is `◆ Manager › Implement · 2/4 · minion/verify · sol#medium`.
- Ready status uses the selected workflow's stable theme color. Active status follows the current phase: info for planning, success for implementing, warning for verifying, accent for reviewing, and warning for researching. Waiting, terminal-success, and terminal-error states use warning, success, and error tokens respectively.
- The band shows `ready` when Manager mode is active without a running task.
- Detailed information is available on demand instead of expanding the default band.
- The canonical shortcut action is `manager.open`. The suggested default is `<leader>o`, subject to collision detection and user override; `/manager` and the command palette remain canonical access paths.
- The UI remains understandable at narrow widths by progressively eliding model, profile, and phase detail while preserving state and workflow.
- English is the only shipped V1 UI language. Copy is centralized for future localization.

### Settings and history UI

- `/manager/settings` opens a native TUI route or large dialog with Models, Limits, Approvals, Workflows, and Appearance sections.
- Provide a short, dismissible first-run explanation; do not block first use on configuration.
- Model/variant selectors are populated from the live policy-filtered catalog.
- Save target is explicitly Global or Project.
- `/manager/history` lists the latest project runs with workflow, outcome, time, duration, and active child count.
- A run detail view shows phases, model/fallback decisions, usage metrics, child session references, errors, and recovery actions.
- Deleting history removes only Minion Manager metadata, never OpenCode sessions or project files.

### Desktop experience

- Manager appears in OpenCode's native primary-agent selection.
- Direct Manager commands work where Desktop supports native OpenCode commands.
- Core orchestration and persisted run state are identical to terminal behavior.
- Desktop does not receive a custom imitation of the TUI picker, status band, or settings screen in V1.
- Configuration remains available through project/global configuration and validated commands or diagnostics until a stable Desktop plugin UI extension exists.

### Privacy and diagnostics

- No Minion Manager telemetry.
- No prompt relay or service operated by Minion Manager.
- Model requests use only providers configured in OpenCode.
- Detailed debug logging is opt-in.
- Debug output redacts credentials, environment secrets, authorization headers, and configured sensitive patterns.
- Normal logs contain run IDs and state transitions, not full prompts or model outputs.

### Packaging and compatibility

- Publish `opencode-minion-manager` to npm under the MIT license.
- Declare the exact supported OpenCode V2 range and matching `@opencode-ai/plugin` dependency strategy.
- Test both the packed npm artifact and local-path development installation.
- Because OpenCode V2 is beta, incompatible host API changes require a Minion Manager compatibility release and matrix update.
- Avoid lifecycle scripts and native binaries so installation works in OpenCode's isolated plugin cache.

## Testing Decisions

### Primary test seam

The principal test seam is one headless orchestration port: supply a fake OpenCode catalog/session client, a fake permission view, and a deterministic task; then observe child-session requests, selected model pairs, run-state events, approvals, interruptions, results, and persisted metadata. Tests assert externally visible behavior rather than private helper calls.

This seam covers workflow and routing behavior without live providers, network access, terminal rendering, or repository mutation. It also lets compatibility adapters change while domain behavior stays stable.

### Test layers

- Schema tests cover defaults, global/project precedence, invalid values, version migration, and redaction.
- State-machine tests cover all valid phase transitions, terminal outcomes, correction limits, cancellation, restart recovery, and prevention of duplicate writers.
- Routing contract tests cover live catalog filtering, exact variant validation, `Auto`/`Prefer`/`Pin`, transient retry, fallback approval, unknown pricing, and forbidden models.
- Permission contract tests verify that every profile narrows host permissions and that read-only-to-write escalation pauses.
- Workflow integration tests cover trivial and planned implementation, verification failure, review findings, two correction cycles, review scope detection, codebase/external/mixed research, and explicit report creation.
- Plugin-host integration tests verify V2 agent/command/tool registration, child-session parentage, explicit model and variant prompt selection, interrupt propagation, and clean plugin disposal/reload.
- TUI component tests verify keyboard navigation, dialog behavior, semantic colors, motion modes, narrow layouts, screen-reader-friendly labels where supported, and width-stable icons.
- Snapshot or shape tests are limited to stable visual contracts: picker structure, status-band states, and key narrow-width layouts.
- Terminal Control end-to-end tests cover installation, Manager selection, each main workflow with deterministic fake providers, status transitions, settings save, history, cancellation, restart recovery, and reduced motion.
- Windows receives native smoke tests for installation, path handling, persistence, keyboard input, and rendering, plus WSL coverage where useful.
- Linux receives the complete release-blocking Terminal Control suite.
- macOS receives CI for package, unit, integration, and renderer tests; native Terminal Control validation becomes release-blocking when hardware is available.
- Package tests run `npm pack`, install the tarball into a clean fixture, load it through OpenCode, and verify the exported server and TUI entrypoints.

### Release gates

- No Manager concrete-work capability.
- No unauthorized model, variant, writer, or permission escalation in contract tests.
- No silent fallback.
- No automatic destructive rollback.
- All terminal states and interrupted states recover predictably.
- Packed-package installation succeeds on Linux and Windows.
- TUI core flows pass Terminal Control on Linux.
- Documentation and compatibility matrix match the tested OpenCode build.

## Out of Scope

- User-authored workflow DSL or arbitrary custom workflow builder.
- Parallel writers in the same worktree.
- Automatic creation and merging of isolated git worktrees.
- Cloud state, cross-machine synchronization, hosted dashboard, or Minion Manager account.
- Minion Manager telemetry or analytics.
- A custom Desktop settings panel, popup, or status band before an official stable extension point exists.
- Automatic rollback, git reset, stash manipulation, commit, push, PR creation, or destructive cleanup unless a future explicit workflow adds them.
- Persisting complete Minion transcripts or hidden reasoning outside OpenCode.
- Hardcoded routing to product model names such as Luna or Sol.
- Guaranteed monetary enforcement when provider pricing or usage is unavailable.
- macOS-native visual sign-off in the initial release.
- Additional shipped UI languages in V1.

## Further Notes

- Product visual reference: [Kit Langton — OPENCODE II / Liquid Crown](https://x.com/kitlangton/status/2076041658945192250).
- OpenCode V2 plugin API is documented as beta and supports agent, catalog, command, session, tool, and event capabilities: [OpenCode V2 Plugins](https://v2.opencode.ai/build/plugins).
- OpenCode's current terminology and permission semantics define `primary`, `subagent`, child sessions, `provider/model#variant`, and ordered permission rules: [OpenCode Agents](https://v2.opencode.ai/agents).
- OpenTUI implementation must depend only on merged public plugin APIs. Experimental branch work may inspire motion or interaction but must not become a required runtime API.
- Terminal Control is the preferred terminal E2E harness: [anomalyco/terminal-control](https://github.com/anomalyco/terminal-control).
- The specification intentionally separates stable product contracts from the beta OpenCode adapter. If a documented V2 operation differs from the targeted OpenCode build, update only the adapter and compatibility range unless product behavior must change.
