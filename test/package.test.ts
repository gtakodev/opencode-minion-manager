import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import serverModule, { server } from "../src/server.js";

describe("OpenCode package entrypoints", () => {
  it("exports the OpenCode server module shape", () => {
    expect(serverModule).toMatchObject({
      id: "opencode.minion-manager",
      server,
    });
  });

  it("declares discoverable server and TUI package exports", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(manifest.exports).toHaveProperty("./server");
    expect(manifest.exports).toHaveProperty("./tui");
  });
});
