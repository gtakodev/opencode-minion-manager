import { z } from "zod";

import type { Profile, ModelPair } from "./types.js";

const pairSchema = z.object({
  providerID: z.string().min(1),
  modelID: z.string().min(1),
  variant: z.string().min(1).optional(),
});

const routingSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("auto") }),
  z.object({ mode: z.literal("prefer"), pair: pairSchema }),
  z.object({ mode: z.literal("pin"), pair: pairSchema }),
]);

const configSchema = z.object({
  schemaVersion: z.literal(1),
  models: z.object({
    allow: z.array(z.string()),
    deny: z.array(z.string()),
    profiles: z.record(z.string(), routingSchema),
  }),
  limits: z.object({
    readers: z.number().int().min(1).max(3),
    writers: z.literal(1),
    history: z.number().int().min(1).max(500),
    corrections: z.number().int().min(0).max(2),
    budget: z.number().nonnegative().nullable(),
  }),
  approvals: z.enum(["adaptive", "always", "never"]),
  motion: z.enum(["full", "reduced", "off"]),
  appearance: z.object({
    shortcut: z.string(),
    firstRunDismissed: z.boolean(),
  }),
  debug: z.object({ enabled: z.boolean(), redact: z.array(z.string()) }),
});

export type RoutingPolicy =
  | { mode: "auto" }
  | { mode: "prefer" | "pin"; pair: ModelPair };

export interface ManagerConfig {
  schemaVersion: 1;
  models: {
    allow: string[];
    deny: string[];
    profiles: Partial<Record<Profile, RoutingPolicy>>;
  };
  limits: {
    readers: number;
    writers: 1;
    history: number;
    corrections: number;
    budget: number | null;
  };
  approvals: "adaptive" | "always" | "never";
  motion: "full" | "reduced" | "off";
  appearance: { shortcut: string; firstRunDismissed: boolean };
  debug: { enabled: boolean; redact: string[] };
}

export type ConfigInput = {
  schemaVersion?: number;
  models?: {
    allow?: string[];
    deny?: string[];
    profiles?: Partial<Record<Profile, RoutingPolicy>>;
  };
  limits?: Partial<ManagerConfig["limits"]>;
  approvals?: ManagerConfig["approvals"];
  motion?: ManagerConfig["motion"];
  appearance?: Partial<ManagerConfig["appearance"]>;
  debug?: Partial<ManagerConfig["debug"]>;
};

export const DEFAULT_CONFIG: ManagerConfig = Object.freeze({
  schemaVersion: 1,
  models: { allow: [], deny: [], profiles: {} },
  limits: {
    readers: 3,
    writers: 1 as const,
    history: 50,
    corrections: 2,
    budget: null,
  },
  approvals: "adaptive",
  motion: "full",
  appearance: { shortcut: "<leader>o", firstRunDismissed: false },
  debug: { enabled: false, redact: [] },
});

export type ConfigResult =
  | { ok: true; value: ManagerConfig }
  | { ok: false; diagnostic: string };

function merge(base: ManagerConfig, layer?: ConfigInput): ManagerConfig {
  if (!layer) return structuredClone(base);
  return {
    ...base,
    ...layer,
    schemaVersion: 1,
    models: {
      ...base.models,
      ...layer.models,
      profiles: { ...base.models.profiles, ...layer.models?.profiles },
    },
    limits: { ...base.limits, ...layer.limits },
    appearance: { ...base.appearance, ...layer.appearance },
    debug: { ...base.debug, ...layer.debug },
  };
}

export function loadConfig(
  global?: ConfigInput,
  project?: ConfigInput,
  plugin?: ConfigInput,
): ConfigResult {
  for (const candidate of [global, project, plugin]) {
    if (
      candidate?.schemaVersion !== undefined &&
      candidate.schemaVersion !== 1
    ) {
      return {
        ok: false,
        diagnostic: `Unsupported Minion Manager configuration schema version ${candidate.schemaVersion}; supported version is 1.`,
      };
    }
  }
  const parsed = configSchema.safeParse(
    merge(merge(merge(DEFAULT_CONFIG, global), project), plugin),
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      diagnostic: `Invalid Minion Manager configuration at ${issue?.path.join(".") || "root"}: ${issue?.message ?? "unknown error"}.`,
    };
  }
  return { ok: true, value: parsed.data as ManagerConfig };
}
