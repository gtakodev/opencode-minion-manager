import type { OpencodeClient } from "@opencode-ai/sdk/v2/client";

import type { CatalogModel } from "../core/types.js";
import type {
  MinionRequest,
  MinionResult,
  SessionPort,
} from "../core/ports.js";

export class OpenCodeSessionPort implements SessionPort {
  constructor(
    private readonly client: OpencodeClient,
    private readonly directory: string,
  ) {}

  async run(
    request: MinionRequest,
    signal: AbortSignal,
    onSession: (sessionID: string) => void,
  ): Promise<MinionResult> {
    let sessionID = request.resumeSessionID;
    if (!sessionID) {
      const created = await this.client.session.create(
        {
          directory: this.directory,
          parentID: request.parentSessionID,
          title: `Minion Manager · ${request.profile}`,
          agent: request.profile,
          model: {
            id: request.pair.modelID,
            providerID: request.pair.providerID,
            ...(request.pair.variant ? { variant: request.pair.variant } : {}),
          },
          metadata: {
            minionManagerRunID: request.runID,
            minionManagerPhase: request.phase,
          },
          ...(request.reportDestination
            ? {
                permission: [
                  { permission: "edit", pattern: "*", action: "deny" },
                  {
                    permission: "edit",
                    pattern: request.reportDestination,
                    action: "ask",
                  },
                ],
              }
            : {}),
        },
        { throwOnError: true },
      );
      if (!created.data) throw new Error("OpenCode created no child session.");
      sessionID = created.data.id;
    }
    onSession(sessionID);
    const abort = () => void this.interrupt(sessionID);
    signal.addEventListener("abort", abort, { once: true });
    try {
      const prompted = await this.client.session.prompt(
        {
          sessionID,
          directory: this.directory,
          model: {
            providerID: request.pair.providerID,
            modelID: request.pair.modelID,
          },
          agent: request.profile,
          ...(request.pair.variant ? { variant: request.pair.variant } : {}),
          ...(request.mode === "read"
            ? { system: "This phase is read-only. Do not modify files." }
            : {}),
          parts: [{ type: "text", text: request.task }],
        },
        { throwOnError: true },
      );
      const response = prompted.data;
      if (!response)
        throw new Error("OpenCode child session returned no response.");
      const output = response.parts
        .filter(
          (
            part,
          ): part is Extract<
            (typeof response.parts)[number],
            { type: "text" }
          > => part.type === "text",
        )
        .map((part) => part.text)
        .join("\n")
        .trim();
      return {
        sessionID,
        output: output || `${request.profile} finished without textual output.`,
        blocking: blockingFromOutput(request.profile, output),
        usage: {
          inputTokens: response.info.tokens.input,
          outputTokens: response.info.tokens.output,
          cost: response.info.cost,
        },
      };
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }

  async interrupt(sessionID: string): Promise<void> {
    await this.client.session.abort({ sessionID, directory: this.directory });
  }
}

export function blockingFromOutput(
  profile: MinionRequest["profile"],
  output: string,
): boolean {
  if (profile !== "minion/verify" && profile !== "minion/review") return false;
  const marker = output.match(/MINION_MANAGER_BLOCKING:\s*(true|false)/i);
  return marker?.[1]?.toLowerCase() !== "false";
}

export async function liveCatalog(
  client: OpencodeClient,
  directory: string,
): Promise<CatalogModel[]> {
  const result = await client.v2.model.list(
    { location: { directory } },
    { throwOnError: true },
  );
  return (result.data?.data ?? [])
    .filter((model) => model.enabled && model.status !== "deprecated")
    .map((model) => ({
      providerID: model.providerID,
      modelID: model.id,
      variants: model.variants.map((variant) => variant.id),
      capabilities: ["text", ...(model.capabilities.tools ? ["tools"] : [])],
      contextLimit: model.limit.context,
      outputLimit: model.limit.output,
      ...(model.cost[0]?.input === undefined
        ? {}
        : { cost: model.cost[0].input }),
    }));
}
