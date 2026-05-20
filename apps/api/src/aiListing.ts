import {
  draftListingFromTranscript,
  taxonomy,
  type AmenityId,
  type EquipmentId,
  type FeatureId,
  type ListingDraft,
  type ShootType
} from "@studio-market/shared";
import { hasConfiguredOpenAi, type RuntimeConfig } from "./env";

export type DraftMode = "local-fallback" | "openai";
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface ListingDraftResult {
  mode: DraftMode;
  draft: ListingDraft;
}

const shootTypeIds = Object.keys(taxonomy.shootTypes) as ShootType[];
const featureIds = Object.keys(taxonomy.features) as FeatureId[];
const equipmentIds = Object.keys(taxonomy.equipment) as EquipmentId[];
const amenityIds = Object.keys(taxonomy.amenities) as AmenityId[];

const listingDraftSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tagline", "description", "shootTypes", "featureIds", "equipmentIds", "amenityIds", "rules"],
  properties: {
    tagline: { type: "string" },
    description: { type: "string" },
    shootTypes: {
      type: "array",
      items: { type: "string", enum: shootTypeIds }
    },
    featureIds: {
      type: "array",
      items: { type: "string", enum: featureIds }
    },
    equipmentIds: {
      type: "array",
      items: { type: "string", enum: equipmentIds }
    },
    amenityIds: {
      type: "array",
      items: { type: "string", enum: amenityIds }
    },
    rules: {
      type: "array",
      items: { type: "string" }
    }
  }
};

const uniqueKnown = <T extends string>(values: unknown, allowed: readonly T[]) =>
  Array.from(new Set(Array.isArray(values) ? values.filter((value): value is T => allowed.includes(value)) : []));

const normalizeDraft = (draft: Partial<ListingDraft>, fallback: ListingDraft): ListingDraft => ({
  tagline: draft.tagline?.trim() || fallback.tagline,
  description: draft.description?.trim() || fallback.description,
  shootTypes: uniqueKnown(draft.shootTypes, shootTypeIds),
  featureIds: uniqueKnown(draft.featureIds, featureIds),
  equipmentIds: uniqueKnown(draft.equipmentIds, equipmentIds),
  amenityIds: uniqueKnown(draft.amenityIds, amenityIds),
  rules: Array.isArray(draft.rules)
    ? draft.rules.map((rule) => String(rule).trim()).filter(Boolean)
    : fallback.rules
});

const extractOutputText = (payload: unknown) => {
  const response = payload as {
    output_text?: string;
    output?: Array<{
      content?: Array<{
        text?: string;
      }>;
    }>;
  };

  return response.output_text ?? response.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text;
};

export const generateListingDraft = async (
  transcript: string,
  config: RuntimeConfig,
  fetchImpl: FetchLike = fetch
): Promise<ListingDraftResult> => {
  const fallback = draftListingFromTranscript(transcript);

  if (!hasConfiguredOpenAi(config)) {
    return {
      mode: "local-fallback",
      draft: fallback
    };
  }

  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.openaiListingModel?.trim() || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "You generate JSON for a photo studio marketplace listing. Use only enum values from the schema. Keep the tagline short and commercial."
          },
          {
            role: "user",
            content: transcript
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "photo_studio_listing_draft",
            strict: true,
            schema: listingDraftSchema
          }
        }
      })
    });

    if (!response.ok) throw new Error(`OpenAI listing draft failed with ${response.status}`);
    const outputText = extractOutputText(await response.json());
    if (!outputText) throw new Error("OpenAI listing draft response did not include output text");

    return {
      mode: "openai",
      draft: normalizeDraft(JSON.parse(outputText) as Partial<ListingDraft>, fallback)
    };
  } catch {
    return {
      mode: "local-fallback",
      draft: fallback
    };
  }
};
