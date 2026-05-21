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

export interface OwnerListingDraft {
  studioName?: string;
  city?: string;
  description?: string;
  suggestedAmenities: string[];
  suggestedRules: string[];
  suggestedRooms: Array<{
    name: string;
    styleTags: string[];
    lightTags: string[];
    props: string[];
  }>;
}

export interface OwnerListingDraftResult {
  mode: DraftMode;
  draft: OwnerListingDraft;
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

const ownerListingDraftSchema = {
  type: "object",
  additionalProperties: false,
  required: ["studioName", "city", "description", "suggestedAmenities", "suggestedRules", "suggestedRooms"],
  properties: {
    studioName: { type: "string" },
    city: { type: "string" },
    description: { type: "string" },
    suggestedAmenities: {
      type: "array",
      items: { type: "string" }
    },
    suggestedRules: {
      type: "array",
      items: { type: "string" }
    },
    suggestedRooms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "styleTags", "lightTags", "props"],
        properties: {
          name: { type: "string" },
          styleTags: {
            type: "array",
            items: { type: "string" }
          },
          lightTags: {
            type: "array",
            items: { type: "string" }
          },
          props: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
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

const cleanTextArray = (values: unknown, limit = 12) =>
  Array.isArray(values)
    ? values.map((value) => String(value).trim()).filter(Boolean).slice(0, limit)
    : [];

const cleanStudioName = (value: string) =>
  value
    .replace(/\b\d[\d\s.,]*(czk|kč|eur|€|usd|\$)\b/gi, "")
    .replace(/\b(per|\/)\s*(hour|hr|day)\b/gi, "")
    .replace(/\b(minimum booking|deposit|cancellation|included|available|rules?)\b.*$/i, "")
    .replace(/[.;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const titleCaseWords = (value: string) =>
  value
    .split(/\s+/)
    .map((word) => (word.length <= 3 && word === word.toUpperCase() ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
    .join(" ");

const inferStudioNameFromTranscript = (transcript: string) => {
  const namedMatch = transcript.match(/\b(?:studio|space|loft|atelier)\s+(?:name\s+)?(?:is|called)\s+([A-Z0-9][^.\n,;:]{1,60})/i)
    ?? transcript.match(/\b(?:called|named)\s+([A-Z0-9][^.\n,;:]{1,60})/i);
  if (namedMatch?.[1]) return cleanStudioName(namedMatch[1]).slice(0, 64);

  const firstPhrase = transcript
    .split(/[\n.!?]/)
    .flatMap((part) => part.split(","))
    .map((part) => cleanStudioName(part))
    .find(Boolean);
  if (!firstPhrase) return undefined;

  const words = firstPhrase
    .replace(/^we have an?\s+/i, "")
    .replace(/^there is an?\s+/i, "")
    .replace(/^this is an?\s+/i, "")
    .split(/\s+/)
    .filter((word) => !/^(with|and|for|including|prices?|price|from)$/i.test(word))
    .slice(0, 6);

  return words.length ? titleCaseWords(words.join(" ")).slice(0, 64) : undefined;
};

const normalizeOwnerDraft = (draft: Partial<OwnerListingDraft>, fallback: OwnerListingDraft): OwnerListingDraft => {
  const legacyDraft = draft as Partial<ListingDraft>;
  const legacySuggestedAmenities = [
    ...cleanTextArray(legacyDraft.featureIds, 20),
    ...cleanTextArray(legacyDraft.equipmentIds, 20),
    ...cleanTextArray(legacyDraft.amenityIds, 20)
  ];
  const suggestedAmenities = cleanTextArray(draft.suggestedAmenities, 20);
  const suggestedRules = cleanTextArray(draft.suggestedRules, 20);

  return {
    studioName: cleanStudioName(draft.studioName ?? "") || fallback.studioName,
    city: draft.city?.trim() || fallback.city,
    description: draft.description?.trim() || legacyDraft.description?.trim() || legacyDraft.tagline?.trim() || fallback.description,
    suggestedAmenities: suggestedAmenities.length ? suggestedAmenities : legacySuggestedAmenities,
    suggestedRules: suggestedRules.length ? suggestedRules : cleanTextArray(legacyDraft.rules, 20),
    suggestedRooms: Array.isArray(draft.suggestedRooms)
      ? draft.suggestedRooms.map((room) => ({
        name: String(room?.name ?? "").trim() || "Main Studio Room",
        styleTags: cleanTextArray(room?.styleTags, 8),
        lightTags: cleanTextArray(room?.lightTags, 8),
        props: cleanTextArray(room?.props, 12)
      })).slice(0, 8)
      : fallback.suggestedRooms
  };
};

const ownerDraftFromTranscript = (transcript: string): OwnerListingDraft => {
  const listingDraft = draftListingFromTranscript(transcript);
  const allSuggested = [
    ...listingDraft.featureIds,
    ...listingDraft.equipmentIds,
    ...listingDraft.amenityIds
  ];

  return {
    studioName: inferStudioNameFromTranscript(transcript),
    city: /(?:prague|praha)/i.test(transcript) ? "Prague" : undefined,
    description: listingDraft.description,
    suggestedAmenities: allSuggested,
    suggestedRules: listingDraft.rules,
    suggestedRooms: []
  };
};

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

export const generateOwnerListingDraft = async (
  transcript: string,
  config: RuntimeConfig,
  fetchImpl: FetchLike = fetch
): Promise<OwnerListingDraftResult> => {
  const fallback = ownerDraftFromTranscript(transcript);

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
            content: [
              "You turn owner-submitted text and uploaded-media OCR into a clean photo studio draft.",
              "The studioName is the listing title. Make it beautiful, concise, and marketplace-ready: 2-6 words, title case, no prices, no address dump, no full sentence, no equipment list, no booking rules, no sales slogan.",
              "If the owner gives an explicit brand or studio name, preserve it and lightly clean punctuation. If not, compose a tasteful name from the strongest location, style, and space-type clues, such as 'Karlin Daylight Loft' or 'Prague Product Studio'.",
              "Do not lose facts that do not belong in studioName. Put prices, deposits, minimum booking, cancellation, access, house rules, included equipment, amenities, room names, light, props, and suitable use cases into description, suggestedAmenities, suggestedRules, and suggestedRooms.",
              "Use suggestedAmenities for concise filter-like facts and known equipment/amenity/feature labels. Use suggestedRooms for room names, room style, light, and props. Preserve currencies, units, and conditions in description or suggestedRules."
            ].join(" ")
          },
          {
            role: "user",
            content: transcript
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "owner_photo_studio_draft",
            strict: true,
            schema: ownerListingDraftSchema
          }
        }
      })
    });

    if (!response.ok) throw new Error(`OpenAI owner listing draft failed with ${response.status}`);
    const outputText = extractOutputText(await response.json());
    if (!outputText) throw new Error("OpenAI owner listing draft response did not include output text");

    return {
      mode: "openai",
      draft: normalizeOwnerDraft(JSON.parse(outputText) as Partial<OwnerListingDraft>, fallback)
    };
  } catch {
    return {
      mode: "local-fallback",
      draft: fallback
    };
  }
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
            content: [
              "You generate JSON for a photo studio marketplace listing. Use only enum values from the schema.",
              "Keep the tagline short and commercial: one polished phrase, not a data dump. Do not include prices, full addresses, booking rules, cancellation terms, or long equipment lists in the tagline.",
              "Parse all owner-provided facts, including text that came from uploaded photos or screenshots.",
              "Pay special attention to prices, currencies, hourly/day rates, deposits, minimum booking durations, cancellation terms, access notes, house rules, included equipment, amenities, room names, light, props, and suitable shoot types.",
              "Put price and policy facts that do not fit enum fields into description or rules so they are not lost. Put equipment, amenities, and features into enum arrays whenever possible."
            ].join(" ")
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
