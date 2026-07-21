import { DEFAULT_CONFIG } from "../../src/core/config.js";
import type { ManagerPorts, MinionRequest } from "../../src/core/ports.js";

export function memoryHarness(
  options: {
    waitForAbort?: boolean;
    blocking?: Partial<Record<MinionRequest["profile"], number>>;
  } = {},
) {
  const requests: MinionRequest[] = [];
  const interrupted: string[] = [];
  let activeReaders = 0;
  let maxActiveReaders = 0;
  let releaseStarted!: () => void;
  const started = new Promise<void>((resolve) => (releaseStarted = resolve));
  const records = new Map<string, unknown>();

  const ports: ManagerPorts = {
    catalog: async () => [
      {
        providerID: "alpha",
        modelID: "fast",
        variants: ["low", "high"],
        capabilities: ["text", "tools"],
        cost: 1,
      },
      {
        providerID: "beta",
        modelID: "deep",
        variants: ["medium"],
        capabilities: ["text", "tools"],
        cost: 4,
      },
    ],
    permissions: async () => ({
      read: true,
      web: true,
      shell: true,
      edit: true,
    }),
    sessions: {
      async run(request, signal, onSession) {
        requests.push(request);
        const id = request.resumeSessionID ?? `child-${requests.length}`;
        onSession(id);
        if (request.mode === "read") {
          activeReaders += 1;
          maxActiveReaders = Math.max(maxActiveReaders, activeReaders);
        }
        releaseStarted();
        if (options.waitForAbort) {
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true }),
          );
          activeReaders -= 1;
          throw new DOMException("Aborted", "AbortError");
        }
        await Promise.resolve();
        if (request.mode === "read") activeReaders -= 1;
        const remaining = options.blocking?.[request.profile] ?? 0;
        if (remaining > 0 && options.blocking)
          options.blocking[request.profile] = remaining - 1;
        return {
          sessionID: id,
          output: `${request.profile} complete`,
          blocking: remaining > 0,
        };
      },
      async interrupt(sessionID) {
        interrupted.push(sessionID);
      },
    },
    storage: {
      async list() {
        return [...records.values()] as never[];
      },
      async save(record) {
        records.set(record.id, structuredClone(record));
      },
      async delete(id) {
        records.delete(id);
      },
    },
    approve: async () => true,
    emit: () => undefined,
    now: (() => {
      let value = 100;
      return () => ++value;
    })(),
    id: (() => {
      let value = 0;
      return () => `run-${++value}`;
    })(),
    worktree: "/work",
    config: DEFAULT_CONFIG,
  };

  return {
    ports,
    requests,
    interrupted,
    started,
    get maxActiveReaders() {
      return maxActiveReaders;
    },
  };
}
