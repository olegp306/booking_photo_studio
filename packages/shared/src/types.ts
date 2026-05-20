export type BookingMode = "instant" | "request" | "hybrid";
export type ListingStatus = "draft" | "in_review" | "published";
export type UserRole = "client" | "photographer" | "studio_owner" | "admin";

export interface UserSession {
  id: string;
  role: UserRole;
  displayName: string;
}

export type SupportCategory =
  | "booking_issue"
  | "studio_info_wrong"
  | "payment"
  | "owner_listing"
  | "idea"
  | "bug";

export interface SupportEvent {
  id: string;
  type: string;
  label: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | undefined>;
}

export interface SupportTicket {
  id: string;
  category: SupportCategory;
  message: string;
  includeActivity: boolean;
  session: UserSession;
  screen: string;
  relatedStudioSlug?: string;
  relatedBookingId?: string;
  relatedShortlistId?: string;
  events: SupportEvent[];
  userAgent?: string;
  createdAt: string;
}

export type ReferralSource = "telegram" | "photographer" | "studio_owner" | "direct" | "unknown";

export interface ReferralRecord {
  id: string;
  source: ReferralSource;
  path: string;
  session: UserSession;
  createdAt: string;
}

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
  kind: "hero" | "room" | "example" | "equipment";
  roomId?: string;
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
  listingStatus: ListingStatus;
  tagline: string;
  description: string;
  moodTags: string[];
  shootTypes: ShootType[];
  featureIds: FeatureId[];
  equipmentIds: EquipmentId[];
  amenityIds: AmenityId[];
  images: StudioImage[];
  rooms: StudioRoom[];
  props: string[];
  accessNotes: string;
  cancellationPolicy: string;
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

export type OwnerBookingDecision = "approve" | "decline";
export type ShortlistDecision = "favourite" | "backup" | "rejected";

export interface SharedShortlistItem {
  studioSlug: string;
  decision?: ShortlistDecision;
  note?: string;
}

export interface SharedShortlist {
  id: string;
  studioSlugs: string[];
  items: SharedShortlistItem[];
  createdAt: string;
}

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

export interface OwnerAvailabilityBlock {
  id: string;
  studioSlug: string;
  roomId: string;
  date: string;
  startTime: string;
  kind?: "hold" | "open";
  reason: string;
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
  ownerNote?: string;
}

export interface StudioReview {
  id: string;
  bookingId: string;
  studioSlug: string;
  guestName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface StudioReviewRequest {
  rating: number;
  comment: string;
}

export interface OwnerListingUpdate {
  tagline?: string;
  description?: string;
  priceFrom?: number;
  bookingMode?: BookingMode;
  shootTypes?: ShootType[];
  featureIds?: FeatureId[];
  equipmentIds?: EquipmentId[];
  amenityIds?: AmenityId[];
  rules?: string[];
  images?: StudioImage[];
  rooms?: StudioRoom[];
  props?: string[];
  accessNotes?: string;
  cancellationPolicy?: string;
  listingStatus?: ListingStatus;
}
