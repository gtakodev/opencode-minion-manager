import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const server = new URL(
  `file://${resolve(import.meta.dirname, "../dist/server.js")}`,
).href;
const fixture = mkdtempSync(join(tmpdir(), "minion-manager-host-"));
let output;
try {
  output = execFileSync(
    "npm",
    [
      "exec",
      "--yes",
      "--package=opencode-ai@1.18.4",
      "--",
      "opencode",
      "agent",
      "list",
      "--print-logs",
      "--log-level",
      "INFO",
    ],
    {
      cwd: fixture,
      encoding: "utf8",
      env: {
        ...process.env,
        OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugin: [server] }),
      },
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
  `OpenCode 1.18.4 loaded Manager and all six Minion profiles from ${server}.`,
);
