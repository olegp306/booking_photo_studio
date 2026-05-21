import type { StudioImage } from "@studio-market/shared";
import { hasConfiguredOpenAi, type RuntimeConfig } from "./env";
import type { DraftMode, FetchLike } from "./aiListing";

export interface MediaSuggestionRoom {
  id: string;
  name: string;
}

export interface MediaSuggestionRequest {
  caption?: string;
  imageUrl?: string;
  rooms?: MediaSuggestionRoom[];
}

export interface MediaSuggestion {
  kind: StudioImage["kind"];
  roomId?: string;
  reason: string;
}

export interface MediaSuggestionResult {
  mode: DraftMode;
  suggestion: MediaSuggestion;
}

export interface OwnerMediaFacts {
  observedText: string;
  priceNotes: string[];
  conditionNotes: string[];
  amenityNotes: string[];
  roomNotes: string[];
}

const mediaKinds: Array<StudioImage["kind"]> = ["hero", "room", "example", "equipment"];

const mediaSuggestionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "roomId", "reason"],
  properties: {
    kind: { type: "string", enum: mediaKinds },
    roomId: { type: ["string", "null"] },
    reason: { type: "string" }
  }
};

const ownerMediaFactsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["observedText", "priceNotes", "conditionNotes", "amenityNotes", "roomNotes"],
  properties: {
    observedText: { type: "string" },
    priceNotes: {
      type: "array",
      items: { type: "string" }
    },
    conditionNotes: {
      type: "array",
      items: { type: "string" }
    },
    amenityNotes: {
      type: "array",
      items: { type: "string" }
    },
    roomNotes: {
      type: "array",
      items: { type: "string" }
    }
  }
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

const normalizedRoom = (rooms: MediaSuggestionRoom[], roomId: unknown) => {
  if (typeof roomId !== "string") return undefined;
  return rooms.some((room) => room.id === roomId) ? roomId : undefined;
};

const normalizeSuggestion = (value: Partial<MediaSuggestion> & { roomId?: unknown }, fallback: MediaSuggestion, rooms: MediaSuggestionRoom[]) => {
  const kind = mediaKinds.includes(value.kind as StudioImage["kind"])
    ? (value.kind as StudioImage["kind"])
    : fallback.kind;
  const roomId = kind === "room" ? normalizedRoom(rooms, value.roomId) ?? fallback.roomId : undefined;

  return {
    kind,
    roomId,
    reason: value.reason?.trim() || fallback.reason
  };
};

export const suggestMediaLocally = ({ caption = "", imageUrl = "", rooms = [] }: MediaSuggestionRequest): MediaSuggestion => {
  const note = `${caption} ${imageUrl}`.toLowerCase();
  const matchingRoom =
    rooms.find((room) => note.includes(room.name.toLowerCase())) ??
    rooms.find((room) => {
      const normalizedName = room.name.toLowerCase();
      return (
        (normalizedName.includes("main") && /main|daylight|cyclorama|window/.test(note)) ||
        (normalizedName.includes("product") && /product|corner|tabletop|still life/.test(note)) ||
        (normalizedName.includes("lounge") && /lounge|sofa|lifestyle|client/.test(note))
      );
    });

  if (matchingRoom) {
    return {
      kind: "room",
      roomId: matchingRoom.id,
      reason: `Matched the media notes to ${matchingRoom.name}.`
    };
  }

  if (/hero|cover|main photo|opening/.test(note)) {
    return {
      kind: "hero",
      reason: "Detected cover-photo language in the media notes."
    };
  }

  if (/equipment|softbox|strobe|stand|c-stand|prop|backdrop|lighting kit/.test(note)) {
    return {
      kind: "equipment",
      reason: "Detected equipment or props in the media notes."
    };
  }

  if (/example|shoot|portrait|fashion|editorial|campaign|lookbook/.test(note)) {
    return {
      kind: "example",
      reason: "Detected example shoot language in the media notes."
    };
  }

  return {
    kind: "room",
    roomId: rooms[0]?.id,
    reason: "Defaulted to room media because the visual subject was broad."
  };
};

export const suggestMediaDetails = async (
  request: MediaSuggestionRequest,
  config: RuntimeConfig,
  fetchImpl: FetchLike = fetch
): Promise<MediaSuggestionResult> => {
  const rooms = request.rooms ?? [];
  const fallback = suggestMediaLocally(request);

  if (!hasConfiguredOpenAi(config)) {
    return {
      mode: "local-fallback",
      suggestion: fallback
    };
  }

  try {
    const content: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }> = [
      {
        type: "input_text",
        text: [
          `Caption: ${request.caption?.trim() || "No caption provided."}`,
          `Rooms: ${rooms.map((room) => `${room.id}=${room.name}`).join(", ") || "No rooms provided."}`,
          "Classify this media for a photo studio marketplace."
        ].join("\n")
      }
    ];

    if (request.imageUrl?.trim()) {
      content.push({
        type: "input_image",
        image_url: request.imageUrl.trim()
      });
    }

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
              "You classify photo studio media. Use kind hero, room, example, or equipment. Only return a roomId when kind is room and it matches a provided room id."
          },
          {
            role: "user",
            content
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "photo_studio_media_suggestion",
            strict: true,
            schema: mediaSuggestionSchema
          }
        }
      })
    });

    if (!response.ok) throw new Error(`OpenAI media suggestion failed with ${response.status}`);
    const outputText = extractOutputText(await response.json());
    if (!outputText) throw new Error("OpenAI media suggestion response did not include output text");

    return {
      mode: "openai",
      suggestion: normalizeSuggestion(JSON.parse(outputText) as Partial<MediaSuggestion>, fallback, rooms)
    };
  } catch {
    return {
      mode: "local-fallback",
      suggestion: fallback
    };
  }
};

const cleanNotes = (values: unknown) =>
  Array.isArray(values) ? values.map((value) => String(value).trim()).filter(Boolean).slice(0, 12) : [];

const normalizeOwnerMediaFacts = (value: Partial<OwnerMediaFacts>): OwnerMediaFacts => ({
  observedText: value.observedText?.trim() ?? "",
  priceNotes: cleanNotes(value.priceNotes),
  conditionNotes: cleanNotes(value.conditionNotes),
  amenityNotes: cleanNotes(value.amenityNotes),
  roomNotes: cleanNotes(value.roomNotes)
});

export const ownerMediaFactsToText = (facts: OwnerMediaFacts) =>
  [
    facts.observedText && `Media text: ${facts.observedText}`,
    facts.priceNotes.length > 0 && `Prices found in uploaded media: ${facts.priceNotes.join("; ")}`,
    facts.conditionNotes.length > 0 && `Conditions found in uploaded media: ${facts.conditionNotes.join("; ")}`,
    facts.amenityNotes.length > 0 && `Amenities found in uploaded media: ${facts.amenityNotes.join("; ")}`,
    facts.roomNotes.length > 0 && `Rooms found in uploaded media: ${facts.roomNotes.join("; ")}`
  ].filter(Boolean).join("\n");

export const extractOwnerMediaFacts = async (
  request: Pick<MediaSuggestionRequest, "caption" | "imageUrl">,
  config: RuntimeConfig,
  fetchImpl: FetchLike = fetch
): Promise<MediaSuggestionResult & { facts: OwnerMediaFacts; text: string }> => {
  const emptyFacts = normalizeOwnerMediaFacts({});
  if (!hasConfiguredOpenAi(config) || !request.imageUrl?.trim()) {
    return {
      mode: "local-fallback",
      suggestion: suggestMediaLocally(request),
      facts: emptyFacts,
      text: ""
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
              "You extract owner-submitted photo studio listing facts from uploaded media.",
              "Read visible text carefully, especially price lists, deposits, minimum booking rules, house rules, access conditions, cancellation terms, room names, equipment, amenities, and included services.",
              "Return only facts visible in the image or caption. Preserve currencies and units such as CZK/hour or EUR/day."
            ].join(" ")
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `File or owner caption: ${request.caption?.trim() || "No caption provided."}`
              },
              {
                type: "input_image",
                image_url: request.imageUrl.trim()
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "photo_studio_media_facts",
            strict: true,
            schema: ownerMediaFactsSchema
          }
        }
      })
    });

    if (!response.ok) throw new Error(`OpenAI owner media facts failed with ${response.status}`);
    const outputText = extractOutputText(await response.json());
    if (!outputText) throw new Error("OpenAI owner media facts response did not include output text");
    const facts = normalizeOwnerMediaFacts(JSON.parse(outputText) as Partial<OwnerMediaFacts>);
    return {
      mode: "openai",
      suggestion: suggestMediaLocally(request),
      facts,
      text: ownerMediaFactsToText(facts)
    };
  } catch {
    return {
      mode: "local-fallback",
      suggestion: suggestMediaLocally(request),
      facts: emptyFacts,
      text: ""
    };
  }
};
