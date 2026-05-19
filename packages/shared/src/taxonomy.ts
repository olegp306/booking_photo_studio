import type { AmenityId, EquipmentId, FeatureId, ShootType } from "./types";

export const shootTypeLabels: Record<ShootType, string> = {
  portrait: "Portrait",
  fashion: "Fashion",
  beauty: "Beauty",
  family: "Family",
  maternity: "Maternity",
  product: "Product",
  ecommerce: "E-commerce",
  video: "Video",
  content: "Content",
  corporate: "Corporate",
  boudoir: "Boudoir"
};

export const featureLabels: Record<FeatureId, string> = {
  "natural-light": "Natural light",
  blackout: "Blackout",
  cyclorama: "Cyclorama",
  "paper-backdrops": "Paper backdrops",
  "colored-walls": "Colored walls",
  "textured-walls": "Textured walls",
  "kitchen-set": "Kitchen set",
  "bedroom-set": "Bedroom set",
  "product-table": "Product table"
};

export const equipmentLabels: Record<EquipmentId, string> = {
  strobes: "Strobes",
  "continuous-lights": "Continuous lights",
  "led-panels": "LED panels",
  softboxes: "Softboxes",
  "c-stands": "C-stands",
  tripods: "Tripods",
  "smoke-machine": "Smoke machine",
  projector: "Projector"
};

export const amenityLabels: Record<AmenityId, string> = {
  "makeup-station": "Makeup station",
  "dressing-room": "Dressing room",
  parking: "Parking",
  elevator: "Elevator",
  "ground-floor": "Ground floor",
  "pet-friendly": "Pet-friendly",
  wifi: "Wi-Fi",
  kitchen: "Kitchen",
  "air-conditioning": "Air conditioning"
};

export const taxonomy = {
  shootTypes: shootTypeLabels,
  features: featureLabels,
  equipment: equipmentLabels,
  amenities: amenityLabels
};
