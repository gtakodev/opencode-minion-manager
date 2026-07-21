# Minion Manager — V1 Implementation Plan

This plan turns the approved V1 specification into independently verifiable increments. Each phase leaves the package runnable or testable and protects the high-level orchestration test seam.

## Delivery Strategy

Build one vertical tracer first: install the V2 plugin, select Manager, execute one deterministic read-only Minion through an exact model/variant pair, observe the status band, and finish with persisted run metadata. Expand workflows and UI only after that path works in a packed installation.

The plan assumes the documented OpenCode V2 capabilities for agents, tools, sessions, commands, catalog access, hooks, and events. The first engineering phase includes a compatibility spike against a pinned OpenCode build because the API is beta.

## Phase 0 — Compatibility Baseline and Repository Bootstrap

### Outcomes

- TypeScript ESM package named `opencode-minion-manager` with MIT license.
- Separate server and TUI exports plus a shared headless core.
- Pinned development versions for OpenCode V2 plugin APIs and OpenTUI-compatible peer/runtime dependencies.
- Compatibility fixture for the exact OpenCode build under test.
- CI matrix starting with Linux and Windows; macOS runs non-visual tests.
- Formatting, typechecking, unit-test, package, and clean-install commands.

### Work

1. Create package metadata, exports, source boundaries, test fixtures, changelog, and compatibility matrix.
2. Add a minimal V2 plugin registering `opencode.minion-manager` and a minimal TUI entrypoint that installs and disposes cleanly.
3. Verify current contracts for agent transforms, tool transforms, session create/prompt/interrupt, catalog listing, event subscription, command transforms, plugin options, and TUI routes/dialogs/keymaps/slots.
4. Add a small compatibility adapter and contract test so later OpenCode beta changes have one repair point.
5. Pack the npm tarball, install it into a clean OpenCode fixture, and verify both entrypoints load.

### Exit Criteria

- Clean local-path and packed-package installation.
- Plugin appears in the active V2 plugin list.
- Server and TUI adapters activate and dispose without leaks.
- CI passes on Linux and Windows; macOS compiles and tests.

## Phase 1 — Domain Core, Configuration, and Persistence

### Outcomes

- Framework-independent run state machine.
- Versioned configuration and run-record schemas.
- Global/project/default merge behavior.
- Atomic local persistence with 50-run retention.
- Explicit ports for OpenCode sessions, catalog, permissions, clock, IDs, storage, and UI events.

### Work

1. Define domain vocabulary and run/phase terminal states.
2. Implement legal transitions and invariant checks: one writer, correction limit, explicit escalation, terminal idempotency, and cancellation propagation.
3. Implement zero-config defaults and global/project precedence.
4. Implement model policies, profile policies, budgets, approvals, concurrency, history, motion, and debug/redaction settings.
5. Persist only orchestration metadata and OpenCode session references, never duplicate transcripts.
6. Mark non-terminal records interrupted on activation and expose resume/restart/abandon decisions.
7. Add pure contract fixtures for deterministic runs.

### Exit Criteria

- State-machine and configuration tests cover all approved rules.
- Concurrent writer acquisition is impossible in tests.
- Interrupted runs never auto-resume.
- Corrupt or unsupported configuration disables only Minion Manager with an actionable diagnostic.

## Phase 2 — Agents, Dynamic Delegation, and Model Router

### Outcomes

- Native Manager and six Minion profiles.
- Custom Manager-only delegation tool.
- Live catalog normalization and exact model/variant validation.
- `Auto`, `Prefer`, and `Pin` routing with visible fallbacks.
- Parent/child OpenCode session lineage and interruption.

### Work

1. Register Manager as `primary` with coordination-only permissions.
2. Register all `minion/*` profiles with least-privilege permissions and recursion disabled.
3. Normalize the enabled model catalog into a compact routing view containing only available, policy-relevant data.
4. Implement routing validation, transient retry classification, alternative selection requests, budget approval, and fallback audit records.
5. Implement delegation by creating a child session and prompting it with the exact profile, provider/model, and optional catalog variant.
6. Emit structured start/progress/wait/fallback/finish/error events.
7. Interrupt all run-owned children on cancellation or plugin disposal.
8. Prove that two simultaneous read-only Minions can use different model pairs without shared-agent mutation or race conditions.

### Exit Criteria

- An integration test delegates two different profiles to two exact model/variant pairs.
- Invalid variants fail before child execution.
- Pinned unavailable pairs never fall back.
- A transient error is retried once; any alternative is explicit and recorded.
- The Manager cannot edit files or execute shell commands.

## Phase 3 — First Vertical Workflow and TUI Shell

### Outcomes

- End-to-end `Research` tracer.
- `/manager` picker with `Auto`, `Implement`, `Review`, and `Research`.
- Persistent per-session mode and one-shot direct commands.
- Composer status band with working/waiting/success/error states.
- Portable pixel-art icons and motion modes.

### Work

1. Register Manager commands and command-palette actions.
2. Register `manager.open` with suggested `<leader>o`, collision-safe and configurable.
3. Build the workflow picker with text labels, block-character icons, keyboard navigation, theme colors, and narrow-width behavior.
4. Add the status slot above the session composer and connect it to domain events.
5. Implement localized breathing/glimmer/handoff animations inspired by Liquid Crown, plus reduced and off modes.
6. Implement a narrow codebase-research run with a deterministic fake provider and persisted outcome.
7. Add `/manager/off` and ready-state presentation.
8. Record a Terminal Control golden flow for install → select Research → run Minion → inspect success.

### Exit Criteria

- The packed plugin completes the tracer flow in a real OpenCode TUI.
- Status never depends on emoji or Nerd Font width.
- Reduced/off modes remove continuous motion.
- Desktop still loads the same Manager and commands without importing TUI runtime code.

## Phase 4 — Review Workflow

### Outcomes

- Standalone read-only review.
- Explicit and automatic scope selection.
- Stable finding contract.
- No-finding and insufficient-scope outcomes.

### Work

1. Implement explicit target parsing for files, directories, commits, ranges, branches, and PR references supported by available tools.
2. Implement fallback scope detection: dirty worktree, then branch merge-base, then request a target.
3. Provide task, rules, and diff context without implementer reasoning.
4. Normalize findings by severity, location, confidence, evidence, impact, and remediation direction.
5. Deny edits and enforce confirmation for any later escalation.
6. Add direct `/manager/review` and active-mode follow-ups.

### Exit Criteria

- Contract tests cover every scope precedence branch.
- A review cannot mutate the fixture worktree.
- Findings render severity-first; no-findings includes residual gaps.
- Read-only-to-write transitions require explicit approval.

## Phase 5 — Implement Workflow

### Outcomes

- Adaptive plan/approval/implement/verify/review loop.
- Single writer lease.
- Fresh independent review.
- Two controlled correction cycles.
- Clear success, partial, failure, cancellation, and blocked outcomes.

### Work

1. Implement task-risk classification and plan-skipping rules for trivial work.
2. Invoke `minion/plan` when complexity or risk requires it and pause according to adaptive approval.
3. Acquire the worktree writer lease before `minion/implement`.
4. Run verification with project-relevant checks and preserve skipped-check reasons.
5. Launch a fresh review child with task, rules, and diff but no implementer hidden reasoning.
6. Reuse the implementation child for corrections and rerun verification/review after each cycle.
7. Stop automatic corrections after two cycles and present remaining issues and choices.
8. Implement force-auto as removal of optional Manager pauses, never host permission bypass.
9. Add direct `/manager/implement`.

### Exit Criteria

- Trivial work can complete without a plan.
- Risky work pauses before writing.
- Only one writer exists under concurrent requests.
- The reviewer child has independent context.
- Correction cycle three cannot start automatically.
- Cancellation preserves worktree content and performs no rollback.

## Phase 6 — Full Research Workflow and Reports

### Outcomes

- Codebase, external, and mixed research modes.
- Up to three parallel read-only researchers.
- Evidence-aware synthesis.
- Explicit-only Markdown reports.

### Work

1. Implement research classification and separable inquiry planning.
2. Schedule up to three read-only Minions under concurrency and budget policies.
3. Normalize source records and distinguish facts, inferences, uncertainty, disagreement, and recommendation.
4. Require citations for external claims and surface missing-source limitations.
5. Return chat output by default.
6. Invoke `minion/report` only on explicit request and constrain its write destination.
7. Add direct `/manager/research`.

### Exit Criteria

- Parallel research obeys the three-reader limit.
- External conclusions retain source links.
- No report file is written by default.
- Explicit reports cannot write outside the approved destination under plugin policy.

## Phase 7 — Settings, History, and Recovery UI

### Outcomes

- Native TUI settings experience.
- Live catalog model/variant selectors.
- Global/project save scopes.
- Run history, details, deletion, and interruption recovery.

### Work

1. Build Models, Limits, Approvals, Workflows, and Appearance settings sections.
2. Add immediate validation, scope selection, restore defaults, and save diagnostics.
3. Add a dismissible first-run explanation without blocking first use.
4. Build the 50-run project history list and detail route.
5. Implement Resume, Restart phase, Abandon, and metadata-only delete actions.
6. Revalidate worktree, catalog, configuration, and permissions before recovery.
7. Add debug-mode control and show the location of redacted diagnostics.

### Exit Criteria

- Settings round-trip through global and project scopes.
- Project settings win predictably.
- Invalid selections cannot be saved silently.
- Recovery never launches work until revalidation succeeds.
- History deletion leaves OpenCode sessions and project files untouched.

## Phase 8 — Desktop Parity at the Shared-Core Level

### Outcomes

- Manager selectable through Desktop's native agent UI.
- Commands and orchestration work without the TUI package loaded.
- Clear Desktop diagnostics and configuration guidance.
- No custom imitation of unsupported Desktop plugin UI.

### Work

1. Test Manager selection, one-shot commands, approvals, child sessions, cancellation, and persisted state through Desktop-supported surfaces.
2. Ensure server entrypoint has no terminal-only imports or assumptions.
3. Render concise structured tool results that Desktop can display natively.
4. Document how to configure global/project settings outside the TUI.
5. Add an extension-point watch note for a future native Desktop settings panel.

### Exit Criteria

- All four entry workflows can start through supported Desktop controls.
- Shared core outcomes match TUI runs.
- No TUI dependency is required by Desktop/server activation.

## Phase 9 — Cross-Platform E2E, Hardening, and Publication

### Outcomes

- Release-quality Linux and Windows support.
- macOS design/CI compatibility.
- Terminal Control regression suite.
- Security, privacy, package, and compatibility checks.
- npm release candidate and documentation.

### Work

1. Run complete Terminal Control flows on Linux: picker, all workflows, settings, history, cancellation, restart, reduced motion, narrow terminal, and errors.
2. Run Windows native smoke tests for installation, paths, persistence, keyboard behavior, process interruption, and rendering; add WSL coverage where useful.
3. Run macOS CI and document the deferred native visual test status.
4. Test plugin disable/reload/disposal during active and idle runs.
5. Audit redaction, log content, file destinations, permission narrowing, and absence of telemetry.
6. Test known-cost, unknown-cost, provider outage, missing model, missing variant, and catalog-change scenarios.
7. Install the packed artifact from a clean cache under every supported OpenCode version.
8. Write user documentation, configuration reference, troubleshooting, security model, contribution guide, compatibility matrix, and release notes.
9. Publish a prerelease, validate real installation, then publish V1 when release gates pass.

### Exit Criteria

- All release gates in the specification pass.
- Linux E2E is green and Windows native smoke is green.
- The npm tarball contains only intended runtime and documentation files.
- Compatibility range matches tested builds.
- macOS limitation is explicit and does not masquerade as native validation.

## Suggested Ticket Breakdown

1. Bootstrap package, exports, CI, license, and compatibility fixture.
2. Implement OpenCode V2 compatibility adapter and packed-install test.
3. Implement configuration schemas, precedence, and validation.
4. Implement run state machine, storage, retention, and recovery markers.
5. Register Manager and least-privilege Minion profiles.
6. Implement catalog normalization and routing policies.
7. Implement dynamic delegation tool and child-session lifecycle.
8. Build TUI Manager picker, keymap action, icons, and session mode.
9. Build composer status band and motion system.
10. Deliver Research tracer and first Terminal Control golden flow.
11. Implement Review workflow and finding contract.
12. Implement Implement workflow through verify/review.
13. Add correction cycles, adaptive approvals, and cancellation.
14. Complete parallel Research and explicit report output.
15. Build settings UI and first-run assistant.
16. Build history and interruption recovery UI.
17. Validate Desktop shared-core behavior and documentation.
18. Complete cross-platform E2E, privacy/security audit, and npm publication.

## Critical Risks and Mitigations

### OpenCode V2 API churn

Mitigation: pin exact tested builds, keep one compatibility adapter, test the packed plugin, and publish a clear matrix. Do not depend on internal plugin phase ordering.

### Model/variant selection races

Mitigation: select the exact pair on each child session prompt. Never mutate a shared profile's model to route an individual invocation.

### Permission mismatch between parent and child

Mitigation: least-privilege profile declarations plus plugin-side policy checks before delegation. Treat hidden profiles as presentation only, never security.

### Concurrent writes

Mitigation: one writer lease per worktree and no V1 parallel-writer feature.

### Provider price gaps

Mitigation: display unknown cost honestly and fall back to model policy, concurrency, retry, step, and correction limits.

### TUI performance

Mitigation: localized, low-frequency animation; reduced/off modes; no full-screen per-cell effects; measure renderer load under Terminal Control.

### Cross-platform glyph and key differences

Mitigation: width-stable glyph set, labels always present, configurable keymap action, collision detection, and native Windows tests.

### Partial edits after interruption

Mitigation: no automatic rollback, explicit cancelled/interrupted states, worktree revalidation, and user-controlled recovery.

## Definition of Done

V1 is done when a clean npm installation on a supported OpenCode V2 build can select Manager, run each principal workflow with exact catalog-validated Minion model pairs, enforce permissions and writer concurrency, show transparent TUI state, configure global/project policy, recover interrupted runs, and pass the specified Linux and Windows release gates without telemetry or destructive rollback.
