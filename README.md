# Minion Manager

Minion Manager is an OpenCode-native orchestration plugin. It adds a visible `Manager` primary agent and six least-privilege Minions for planning, implementation, verification, review, research, and explicit report writing.

The Manager coordinates but cannot edit files or run shell commands. Every child invocation uses an exact live-catalog `provider/model#variant` pair, a child session related to the parent, and the narrow permission profile for its role.

## Requirements

- OpenCode and `@opencode-ai/plugin` 1.18.4
- Node.js 22 or newer for development and package checks
- OpenTUI 0.4.5 or newer when loading the optional TUI entrypoint
- Linux or Windows/WSL; macOS is compile-tested but has no V1 visual sign-off

## Install

Add the package to OpenCode configuration:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-minion-manager"]
}
```

For local development, use the packed tarball produced by `npm pack` or point the plugin entry at `dist/server.js`. OpenCode supplies the optional TUI peers when it loads `opencode-minion-manager/tui`.

Select **Manager** in OpenCode's native agent picker. In the terminal, `/manager` or the `manager.open` action (`<leader>o` by default) opens the workflow picker:

- Auto classifies and announces the principal workflow.
- Implement delegates implementation, verification, and independent review.
- Review is read-only and uses explicit scope before dirty-worktree/merge-base fallback.
- Research runs up to three independent readers; reports are written only when explicitly requested.

Direct one-shot commands are `/manager/implement`, `/manager/review`, and `/manager/research`. Additional commands cover settings, history, cancellation, and `/manager/off`.

## Configuration

Zero configuration uses conservative defaults: three readers, one writer, two correction cycles, 50 project run records, adaptive approvals, and no monetary budget assumption. Project values override global values; plugin options override both.

```json
[
  "opencode-minion-manager",
  {
    "config": {
      "schemaVersion": 1,
      "models": {
        "allow": ["provider/model"],
        "deny": [],
        "profiles": {
          "minion/review": {
            "mode": "prefer",
            "pair": {
              "providerID": "provider",
              "modelID": "model",
              "variant": "medium"
            }
          }
        }
      },
      "limits": {
        "readers": 3,
        "writers": 1,
        "history": 50,
        "corrections": 2,
        "budget": null
      },
      "approvals": "adaptive",
      "motion": "reduced",
      "debug": { "enabled": false, "redact": [] }
    }
  }
]
```

Routing modes are `auto`, `prefer`, and `pin`. A missing pinned pair fails before child execution. A preferred fallback is visible and persisted; policy-denied pairs never fall back. Unknown provider pricing remains `unknown` rather than estimated.

Run metadata is stored atomically at `.opencode/minion-manager/runs.json` with owner-only file mode. It contains orchestration metadata and child session references, never transcripts or hidden reasoning. Active records become `interrupted` after restart and are never resumed automatically.

## Safety model

- Manager: delegation only; no edit, bash, generic task delegation, or web fetch.
- Plan/review: repository read only.
- Research: read plus host-permitted web access.
- Verify: read plus minimum host-permitted shell checks.
- Implement: host-permitted edit and shell under one writer lease per worktree.
- Report: only an explicitly named destination.

Minion Manager only narrows host permissions. Cancellation interrupts owned children and preserves worktree contents; it never resets, checks out, stashes, deletes, or rolls back files. The package has no telemetry or third-party relay.

## Development on WSL

```sh
npm install
npm run check
npm run build
npm run host:check
npm run pack:check
```

`host:check` loads the built server entrypoint in OpenCode 1.18.4 and verifies that Manager plus all six Minions register. `pack:check` creates a clean temporary fixture, installs the tarball plus the pinned host TUI peers with lifecycle scripts disabled, and imports the server, V2, TUI, and core exports from that installed copy.

See [the approved specification](docs/MINION_MANAGER_SPEC.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md), and [compatibility matrix](docs/COMPATIBILITY.md).
