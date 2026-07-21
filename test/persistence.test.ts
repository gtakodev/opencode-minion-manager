import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FileRunStorage } from "../src/core/persistence.js";
import { createRun } from "../src/core/types.js";

describe("run persistence seam", () => {
  it("writes atomically, retains the newest records, and stores no transcript", async () => {
    const directory = await mkdtemp(join(tmpdir(), "minion-manager-"));
    const path = join(directory, "runs.json");
    const storage = new FileRunStorage(path, 2);
    await storage.save(createRun("one", "research", "first", 1));
    await storage.save(createRun("two", "review", "second", 2));
    await storage.save(createRun("three", "implement", "third", 3));

    expect((await storage.list()).map((record) => record.id)).toEqual([
      "three",
      "two",
    ]);
    expect(await readFile(path, "utf8")).not.toMatch(
      /transcript|hiddenReasoning/,
    );
  });

  it("marks active runs interrupted and never auto-resumes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "minion-manager-"));
    const storage = new FileRunStorage(join(directory, "runs.json"));
    const run = createRun("one", "research", "task", 1);
    run.status = "running";
    await storage.save(run);

    const [interrupted] = await storage.markInterrupted(10);
    expect(interrupted).toMatchObject({
      status: "interrupted",
      updatedAt: 10,
      recovery: ["resume", "restart-phase", "abandon"],
    });
  });
});
