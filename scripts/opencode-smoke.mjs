import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const plugin = new URL(`file://${resolve(import.meta.dirname, "..")}/`).href;
const temporaryRoot = process.platform === "linux" ? "/tmp" : tmpdir();
const fixture = mkdtempSync(join(temporaryRoot, "minion-manager-host-"));
const configHome = join(fixture, "config");
const opencode = [
  "exec",
  "--yes",
  "--package=opencode-ai@1.18.4",
  "--",
  "opencode",
];
const env = { ...process.env, XDG_CONFIG_HOME: configHome };
let output;
try {
  execFileSync("npm", [...opencode, "plugin", plugin, "--global", "--force"], {
    cwd: fixture,
    encoding: "utf8",
    env,
    timeout: 30_000,
  });
  const serverConfig = JSON.parse(
    readFileSync(join(configHome, "opencode", "opencode.jsonc"), "utf8"),
  );
  const tuiConfig = JSON.parse(
    readFileSync(join(configHome, "opencode", "tui.json"), "utf8"),
  );
  if (
    !serverConfig.plugin?.includes(plugin) ||
    !tuiConfig.plugin?.includes(plugin)
  ) {
    throw new Error(
      "OpenCode installer did not configure both plugin targets.",
    );
  }
  output = execFileSync(
    "npm",
    [...opencode, "agent", "list", "--print-logs", "--log-level", "INFO"],
    {
      cwd: fixture,
      encoding: "utf8",
      env: {
        ...process.env,
        XDG_CONFIG_HOME: join(fixture, "runtime-config"),
        OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugin: [plugin] }),
      },
      timeout: 30_000,
    },
  );
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

const required = [
  "Manager (primary)",
  "minion/plan (subagent)",
  "minion/implement (subagent)",
  "minion/review (subagent)",
  "minion/research (subagent)",
  "minion/verify (subagent)",
  "minion/report (subagent)",
];
const missing = required.filter((agent) => !output.includes(agent));
if (missing.length)
  throw new Error(`OpenCode host did not register: ${missing.join(", ")}`);
console.log(
  `OpenCode 1.18.4 discovered the package server entrypoint and loaded Manager plus all six Minion profiles from ${plugin}.`,
);
