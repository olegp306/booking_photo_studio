export type BookingMode = "instant" | "request" | "hybrid";

export type ShootType =
  | "portrait"
  | "fashion"
  | "beauty"
  | "family"
  | "maternity"
  | "product"
  | "ecommerce"
  | "video"
  | "content"
  | "corporate"
  | "boudoir";

export type EquipmentId =
  | "strobes"
  | "continuous-lights"
  | "led-panels"
  | "softboxes"
  | "c-stands"
  | "tripods"
  | "smoke-machine"
  | "projector";

export type AmenityId =
  | "makeup-station"
  | "dressing-room"
  | "parking"
  | "elevator"
  | "ground-floor"
  | "pet-friendly"
  | "wifi"
  | "kitchen"
  | "air-conditioning";

export type FeatureId =
  | "natural-light"
  | "blackout"
  | "cyclorama"
  | "paper-backdrops"
  | "colored-walls"
  | "textured-walls"
  | "kitchen-set"
  | "bedroom-set"
  | "product-table";

export interface City {
  id: string;
  name: string;
  countryCode: string;
  currency: "CZK" | "EUR";
}

export interface StudioImage {
  id: string;
  url: string;
  alt: string;
  kind: "hero" | "room" | "example";
}

export interface StudioRoom {
  id: string;
  name: string;
  summary: string;
  areaSqm: number;
  ceilingHeightM: number;
  capacity: number;
  pricePerHour: number;
  bookingMode: BookingMode;
  featureIds: FeatureId[];
  equipmentIds: EquipmentId[];
  imageIds: string[];
}

export interface Studio {
  id: string;
  slug: string;
  name: string;
  city: City;
  district: string;
  addressHint: string;
  latitude: number;
  longitude: number;
  rating: number;
  reviewCount: number;
  priceFrom: number;
  currency: City["currency"];
  bookingMode: BookingMode;
  ownerName: string;
  tagline: string;
  description: string;
  moodTags: string[];
  shootTypes: ShootType[];
  featureIds: FeatureId[];
  equipmentIds: EquipmentId[];
  amenityIds: AmenityId[];
  images: StudioImage[];
  rooms: StudioRoom[];
  rules: string[];
}

export interface StudioSearchFilters {
  cityId?: string;
  query?: string;
  maxPrice?: number;
  shootType?: ShootType;
  featureIds?: FeatureId[];
  equipmentIds?: EquipmentId[];
  amenityIds?: AmenityId[];
  bookingMode?: BookingMode;
}

export type BookingStatus =
  | "pending_owner_approval"
  | "awaiting_payment"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "completed";

export interface AvailabilitySlot {
  id: string;
  studioSlug: string;
  roomId: string;
  roomName: string;
  date: string;
  startTime: string;
  durationHours: number;
  bookingMode: BookingMode;
  price: number;
  currency: City["currency"];
  available: boolean;
}

export interface StudioAvailability {
  studioSlug: string;
  date: string;
  slots: AvailabilitySlot[];
}

export interface BookingIntentRequest {
  roomId: string;
  date: string;
  startTime: string;
  durationHours: number;
  guestName: string;
  guestEmail: string;
  shootType: ShootType;
  message: string;
}

export interface BookingIntent {
  id: string;
  studioSlug: string;
  studioName: string;
  roomId: string;
  roomName: string;
  date: string;
  startTime: string;
  durationHours: number;
  bookingMode: BookingMode;
  status: BookingStatus;
  totalPrice: number;
  currency: City["currency"];
  guestName: string;
  guestEmail: string;
  shootType: ShootType;
  message: string;
}
