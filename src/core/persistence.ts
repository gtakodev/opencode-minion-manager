import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import { RunMachine } from "./state.js";
import type { RunRecord } from "./types.js";

const fileSchema = z.object({
  schemaVersion: z.literal(1),
  runs: z.array(z.record(z.string(), z.unknown())),
});

export class FileRunStorage {
  constructor(
    private readonly path: string,
    private readonly historyLimit = 50,
  ) {}

  async list(): Promise<RunRecord[]> {
    let source: string;
    try {
      source = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const parsed = fileSchema.safeParse(JSON.parse(source));
    if (!parsed.success)
      throw new Error(
        `Invalid Minion Manager run store: ${parsed.error.issues[0]?.message ?? "unknown format"}.`,
      );
    return parsed.data.runs as unknown as RunRecord[];
  }

  async save(record: RunRecord): Promise<void> {
    const records = (await this.list()).filter(
      (candidate) => candidate.id !== record.id,
    );
    records.push(structuredClone(record));
    records.sort((left, right) => right.updatedAt - left.updatedAt);
    await this.write(records.slice(0, this.historyLimit));
  }

  async delete(id: string): Promise<void> {
    await this.write((await this.list()).filter((record) => record.id !== id));
  }

  async markInterrupted(now: number): Promise<RunRecord[]> {
    const records = await this.list();
    for (const [index, record] of records.entries()) {
      if (["pending", "running", "waiting"].includes(record.status)) {
        const machine = new RunMachine(record);
        machine.interrupt(now, "OpenCode restarted while the run was active.");
        records[index] = machine.record;
      }
    }
    await this.write(records);
    return records;
  }

  private async write(records: RunRecord[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(
      temporary,
      `${JSON.stringify({ schemaVersion: 1, runs: records }, null, 2)}\n`,
      { mode: 0o600 },
    );
    await rename(temporary, this.path);
  }
}
