import type { RoutingPolicy } from "./config.js";
import type { CatalogModel, ModelDecision, ModelPair } from "./types.js";

export interface ModelRules {
  allow?: string[];
  deny?: string[];
  requiredCapabilities?: string[];
  budget?: number | null;
}

function key(pair: ModelPair): string {
  return `${pair.providerID}/${pair.modelID}`;
}

function allowed(model: CatalogModel, rules: ModelRules): boolean {
  const modelKey = key(model);
  if (rules.deny?.includes(modelKey)) return false;
  if (rules.allow?.length && !rules.allow.includes(modelKey)) return false;
  return (rules.requiredCapabilities ?? []).every((capability) =>
    model.capabilities.includes(capability),
  );
}

function exact(
  catalog: CatalogModel[],
  pair: ModelPair,
  rules: ModelRules,
): CatalogModel | undefined {
  const model = catalog.find(
    (entry) =>
      entry.providerID === pair.providerID &&
      entry.modelID === pair.modelID &&
      allowed(entry, rules),
  );
  if (!model) return undefined;
  if (pair.variant && !model.variants.includes(pair.variant)) {
    throw new Error(
      `Model variant ${pair.variant} is unavailable for ${key(pair)}.`,
    );
  }
  return model;
}

function automatic(catalog: CatalogModel[], rules: ModelRules): CatalogModel {
  const candidates = catalog.filter((model) => allowed(model, rules));
  if (!candidates.length)
    throw new Error(
      "No enabled model satisfies Minion Manager policy and capability requirements.",
    );
  return [...candidates].sort(
    (left, right) =>
      (left.cost ?? Number.POSITIVE_INFINITY) -
      (right.cost ?? Number.POSITIVE_INFINITY),
  )[0]!;
}

export function routeModel(
  catalog: CatalogModel[],
  policy: RoutingPolicy,
  rules: ModelRules,
): ModelDecision {
  if (policy.mode !== "auto") {
    const model = exact(catalog, policy.pair, rules);
    if (model) {
      return {
        pair: { ...policy.pair },
        reason:
          policy.mode === "pin"
            ? "pinned by profile policy"
            : "preferred by profile policy",
        fallback: false,
        ...(model.cost === undefined ? {} : { cost: model.cost }),
      };
    }
    if (policy.mode === "pin")
      throw new Error(
        `Pinned model ${key(policy.pair)} is unavailable or forbidden.`,
      );
    const fallback = automatic(catalog, rules);
    return {
      pair: { providerID: fallback.providerID, modelID: fallback.modelID },
      reason: `preferred model ${key(policy.pair)} is unavailable; selected the lowest-cost allowed alternative`,
      fallback: true,
      ...(fallback.cost === undefined ? {} : { cost: fallback.cost }),
    };
  }
  const model = automatic(catalog, rules);
  return {
    pair: { providerID: model.providerID, modelID: model.modelID },
    reason: "selected from the live allowed catalog",
    fallback: false,
    ...(model.cost === undefined ? {} : { cost: model.cost }),
  };
}

export function assertExactPair(
  catalog: CatalogModel[],
  pair: ModelPair,
  rules: ModelRules,
): ModelDecision {
  return routeModel(catalog, { mode: "pin", pair }, rules);
}
