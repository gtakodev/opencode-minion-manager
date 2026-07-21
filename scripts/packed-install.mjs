import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packOutput = execFileSync("npm", ["pack", "--json"], {
  cwd: root,
  encoding: "utf8",
});
const [{ filename }] = JSON.parse(packOutput);
const temporaryRoot = process.platform === "linux" ? "/tmp" : tmpdir();
const fixture = mkdtempSync(join(temporaryRoot, "minion-manager-packed-"));
writeFileSync(
  join(fixture, "package.json"),
  JSON.stringify({ name: "packed-fixture", private: true, type: "module" }),
);
execFileSync(
  "npm",
  [
    "install",
    "--ignore-scripts",
    join(root, filename),
    "@opentui/core@0.4.5",
    "@opentui/keymap@0.4.5",
    "@opentui/solid@0.4.5",
  ],
  { cwd: fixture, stdio: "inherit" },
);
writeFileSync(
  join(fixture, "verify.mjs"),
  `import * as server from "opencode-minion-manager";
import * as discoveredServer from "opencode-minion-manager/server";
import * as core from "opencode-minion-manager/core";
import * as v2 from "opencode-minion-manager/v2";
import * as tui from "opencode-minion-manager/tui";
if (typeof server.server !== "function" || typeof discoveredServer.server !== "function" || typeof tui.tui !== "function" || v2.MinionManagerV2.id !== "opencode.minion-manager") throw new Error("Packed entrypoint contract failed.");
if (server.default?.server !== server.server || discoveredServer.default?.server !== discoveredServer.server || tui.default?.tui !== tui.tui) throw new Error("OpenCode plugin module shape failed.");
if (core.DEFAULT_CONFIG.limits.writers !== 1) throw new Error("Packed core contract failed.");
`,
);
execFileSync(process.execPath, ["verify.mjs"], {
  cwd: fixture,
  stdio: "inherit",
});
unlinkSync(join(root, filename));
const packed = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
console.log(
  `Packed ${packed.name}@${packed.version} installed in ${fixture}; discoverable server, V2, TUI, and core entrypoints loaded.`,
);
