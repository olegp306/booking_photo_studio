import type { AmenityId, EquipmentId, FeatureId, ShootType } from "./types";

export interface ListingDraft {
  tagline: string;
  description: string;
  shootTypes: ShootType[];
  featureIds: FeatureId[];
  equipmentIds: EquipmentId[];
  amenityIds: AmenityId[];
  rules: string[];
}

const matchAny = (text: string, keywords: string[]) => keywords.some((keyword) => text.includes(keyword));

const firstSentence = (text: string) => text.split(/[.!?]/).map((part) => part.trim()).filter(Boolean)[0] ?? text;

const cleanTitleText = (value: string) =>
  value
    .replace(/\b\d[\d\s.,]*(czk|kč|eur|€|usd|\$)\b/gi, "")
    .replace(/\b(per|\/)\s*(hour|hr|day)\b/gi, "")
    .replace(/\b(minimum booking|deposit|cancellation|included|available|rules?)\b.*$/i, "")
    .replace(/[.;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const titleCaseSentence = (value: string) => {
  const explicitName = value.match(/\b(?:studio|space|loft|atelier)\s+(?:name\s+)?(?:is|called)\s+([A-Z0-9][^.\n,;:]{1,60})/i)
    ?? value.match(/\b(?:called|named)\s+([A-Z0-9][^.\n,;:]{1,60})/i);
  const clean = cleanTitleText(explicitName?.[1] ?? value)
    .replace(/^we have an?\s+/i, "")
    .replace(/^there is an?\s+/i, "")
    .replace(/^this is an?\s+/i, "")
    .split(",")[0]
    .split(/\s+with\s+/i)[0]
    .split(/\s+for\s+/i)[0]
    .trim();
  const title = clean
    .split(/\s+/)
    .filter((word) => !/^(with|and|for|including|prices?|price|from)$/i.test(word))
    .slice(0, 6)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
  return title ? `${title}.` : "";
};

export const draftListingFromTranscript = (transcript: string): ListingDraft => {
  const normalized = transcript.toLowerCase();
  const sentences = transcript
    .split(/[.!?]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const shootTypes: ShootType[] = [];
  if (matchAny(normalized, ["portrait", "portraits"])) shootTypes.push("portrait");
  if (matchAny(normalized, ["fashion", "editorial"])) shootTypes.push("fashion");
  if (matchAny(normalized, ["beauty"])) shootTypes.push("beauty");
  if (matchAny(normalized, ["family"])) shootTypes.push("family");
  if (matchAny(normalized, ["maternity"])) shootTypes.push("maternity");
  if (matchAny(normalized, ["product", "tabletop"])) shootTypes.push("product");
  if (matchAny(normalized, ["e-commerce", "ecommerce"])) shootTypes.push("ecommerce");
  if (matchAny(normalized, ["video", "reels"])) shootTypes.push("video");
  if (matchAny(normalized, ["content", "social"])) shootTypes.push("content");
  if (matchAny(normalized, ["corporate", "headshot"])) shootTypes.push("corporate");
  if (matchAny(normalized, ["boudoir"])) shootTypes.push("boudoir");

  const featureIds: FeatureId[] = [];
  if (matchAny(normalized, ["daylight", "natural light", "large windows"])) featureIds.push("natural-light");
  if (matchAny(normalized, ["blackout", "controlled light"])) featureIds.push("blackout");
  if (matchAny(normalized, ["cyclorama", "cyc wall", "cyc"])) featureIds.push("cyclorama");
  if (matchAny(normalized, ["paper backdrop", "paper backdrops"])) featureIds.push("paper-backdrops");
  if (matchAny(normalized, ["colored wall", "color wall"])) featureIds.push("colored-walls");
  if (matchAny(normalized, ["textured wall", "texture wall"])) featureIds.push("textured-walls");
  if (matchAny(normalized, ["kitchen set", "kitchen"])) featureIds.push("kitchen-set");
  if (matchAny(normalized, ["bedroom set", "bedroom"])) featureIds.push("bedroom-set");
  if (matchAny(normalized, ["product table", "tabletop"])) featureIds.push("product-table");

  const equipmentIds: EquipmentId[] = [];
  if (matchAny(normalized, ["strobe", "strobes", "flash"])) equipmentIds.push("strobes");
  if (matchAny(normalized, ["continuous light", "continuous lights"])) equipmentIds.push("continuous-lights");
  if (matchAny(normalized, ["led panel", "led panels"])) equipmentIds.push("led-panels");
  if (matchAny(normalized, ["softbox", "softboxes"])) equipmentIds.push("softboxes");
  if (matchAny(normalized, ["c-stand", "c-stands"])) equipmentIds.push("c-stands");
  if (matchAny(normalized, ["tripod", "tripods"])) equipmentIds.push("tripods");
  if (matchAny(normalized, ["smoke machine", "haze"])) equipmentIds.push("smoke-machine");
  if (matchAny(normalized, ["projector"])) equipmentIds.push("projector");

  const amenityIds: AmenityId[] = [];
  if (matchAny(normalized, ["makeup station", "make-up station"])) amenityIds.push("makeup-station");
  if (matchAny(normalized, ["dressing room", "changing room"])) amenityIds.push("dressing-room");
  if (matchAny(normalized, ["parking"])) amenityIds.push("parking");
  if (matchAny(normalized, ["elevator", "lift"])) amenityIds.push("elevator");
  if (matchAny(normalized, ["ground floor"])) amenityIds.push("ground-floor");
  if (matchAny(normalized, ["pet-friendly", "pets"])) amenityIds.push("pet-friendly");
  if (matchAny(normalized, ["wifi", "wi-fi"])) amenityIds.push("wifi");
  if (matchAny(normalized, ["kitchen"])) amenityIds.push("kitchen");
  if (matchAny(normalized, ["air conditioning", "air-conditioning"])) amenityIds.push("air-conditioning");

  const rules = sentences.filter((sentence) =>
    matchAny(sentence.toLowerCase(), ["minimum booking", "no ", "must", "allowed", "request"])
  );

  return {
    tagline: titleCaseSentence(firstSentence(transcript)),
    description: transcript.trim(),
    shootTypes,
    featureIds,
    equipmentIds,
    amenityIds,
    rules
  };
};
