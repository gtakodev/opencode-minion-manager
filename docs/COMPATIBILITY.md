# Compatibility matrix

| Component                        | Supported/tested version           | Status                                                                 |
| -------------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| OpenCode / `@opencode-ai/plugin` | 1.18.4                             | Pinned; server and Promise V2 types compile                            |
| `@opencode-ai/sdk`               | 1.18.4                             | Exact child model/variant, prompt, abort, and catalog adapter compiled |
| OpenTUI core/keymap/solid        | 0.4.5                              | TUI entrypoint compiled and clean-installed                            |
| Node.js                          | 24.16.0 on WSL2                    | Full local gate                                                        |
| Linux kernel                     | WSL2 6.18.33.1                     | Unit, integration, build, package, clean install                       |
| Windows native                   | Not run in this repository session | Required before a public V1 release                                    |
| macOS native                     | Not run                            | Design/compile compatibility only                                      |

The host API is beta. Server concerns that are not yet present in the Promise V2 registration API (executable custom tools and session client calls) remain isolated in `src/server.ts` and `src/adapters/opencode.ts`. The V2 registration entrypoint is exported separately at `opencode-minion-manager/v2`.
