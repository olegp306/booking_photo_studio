import {
  CalendarDays,
  Check,
  ChevronLeft,
  CreditCard,
  Heart,
  Home,
  Inbox,
  MapPin,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
  UserRound,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  amenityLabels,
  draftListingFromTranscript,
  equipmentLabels,
  featureLabels,
  shootTypeLabels,
  type AvailabilitySlot,
  type BookingMode,
  type BookingIntent,
  type AmenityId,
  type EquipmentId,
  type FeatureId,
  type OwnerAvailabilityBlock,
  type OwnerListingUpdate,
  type SharedShortlistItem,
  type ShortlistDecision,
  type ShootType,
  type Studio,
  type StudioImage,
  type StudioSearchFilters
} from "@studio-market/shared";
import {
  confirmBookingPayment,
  createOwnerAvailabilityBlock,
  createSharedShortlist,
  decideOwnerBooking,
  loadAvailability,
  loadCustomerBookings,
  loadOwnerBookings,
  loadSharedShortlist,
  loadStudios,
  releaseOwnerAvailabilityBlock,
  submitBookingRequest,
  updateOwnerListing,
  updateSharedShortlist
} from "./api";

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);

const accessibleMoney = (amount: number, currency: string) =>
  `${currency} ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(amount)}`;

const selectedFeatures: FeatureId[] = ["natural-light", "cyclorama", "blackout", "bedroom-set"];
const shootTypes: ShootType[] = ["portrait", "fashion", "maternity", "product", "video", "content"];
const shootTypeOptions = Object.entries(shootTypeLabels) as Array<[ShootType, string]>;
const featureOptions = Object.entries(featureLabels) as Array<[FeatureId, string]>;
const equipmentOptions = Object.entries(equipmentLabels) as Array<[EquipmentId, string]>;
const amenityOptions = Object.entries(amenityLabels) as Array<[AmenityId, string]>;
const mediaKindLabels: Record<StudioImage["kind"], string> = {
  hero: "Hero",
  room: "Rooms",
  example: "Example shoots",
  equipment: "Equipment and props"
};
type AppView = "explore" | "saved" | "bookings" | "host";

const shortlistDecisionLabels: Record<ShortlistDecision, string> = {
  favourite: "Favourite",
  backup: "Backup",
  rejected: "Rejected"
};

const initialViewFromHash = (): AppView => {
  if (window.location.hash === "#saved" || window.location.hash.startsWith("#saved/")) return "saved";
  if (window.location.hash.startsWith("#shortlist/")) return "saved";
  if (window.location.hash === "#bookings") return "bookings";
  if (window.location.hash === "#profile") return "host";
  return "explore";
};

const studioSlugFromHash = () => {
  const prefix = "#studio/";
  return window.location.hash.startsWith(prefix) ? window.location.hash.slice(prefix.length) : undefined;
};

const savedSlugsFromHash = () => {
  const prefix = "#saved/";
  if (!window.location.hash.startsWith(prefix)) return [];
  return window.location.hash
    .slice(prefix.length)
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
};

const shortlistIdFromHash = () => {
  const prefix = "#shortlist/";
  return window.location.hash.startsWith(prefix) ? window.location.hash.slice(prefix.length) : undefined;
};

export const App = () => {
  const [studios, setStudios] = useState<Studio[]>([]);
  const [activeShootType, setActiveShootType] = useState<ShootType | undefined>();
  const [activeFeature, setActiveFeature] = useState<FeatureId | undefined>();
  const [selectedStudio, setSelectedStudio] = useState<Studio | undefined>();
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [view, setView] = useState<AppView>(initialViewFromHash);
  const [ownerBookings, setOwnerBookings] = useState<BookingIntent[]>([]);
  const [customerBookings, setCustomerBookings] = useState<BookingIntent[]>([]);
  const [lastGuestEmail, setLastGuestEmail] = useState<string | undefined>();
  const [hashVersion, setHashVersion] = useState(0);
  const [shortlistItems, setShortlistItems] = useState<Record<string, SharedShortlistItem>>({});
  const [activeShortlistId, setActiveShortlistId] = useState<string | undefined>();

  const filters: StudioSearchFilters = useMemo(
    () => ({
      cityId: "prague",
      shootType: activeShootType,
      featureIds: activeFeature ? [activeFeature] : undefined
    }),
    [activeFeature, activeShootType]
  );

  useEffect(() => {
    loadStudios(filters).then(setStudios);
  }, [filters]);

  useEffect(() => {
    const handleHashChange = () => setHashVersion((current) => current + 1);
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const sharedStudioSlug = studioSlugFromHash();
    if (!sharedStudioSlug || selectedStudio) return;

    const sharedStudio = studios.find((studio) => studio.slug === sharedStudioSlug);
    if (sharedStudio) {
      setSelectedStudio(sharedStudio);
      setView("explore");
    }
  }, [hashVersion, selectedStudio, studios]);

  useEffect(() => {
    const sharedSavedSlugs = savedSlugsFromHash();
    if (!sharedSavedSlugs.length) return;

    setSaved(new Set(sharedSavedSlugs));
    setShortlistItems({});
    setActiveShortlistId(undefined);
    setSelectedStudio(undefined);
    setView("saved");
  }, [hashVersion]);

  useEffect(() => {
    const sharedShortlistId = shortlistIdFromHash();
    if (!sharedShortlistId) return;

    loadSharedShortlist(sharedShortlistId).then((shortlist) => {
      setSaved(new Set(shortlist.studioSlugs));
      setActiveShortlistId(shortlist.id);
      setShortlistItems(
        Object.fromEntries(shortlist.items.map((item) => [item.studioSlug, item])) as Record<string, SharedShortlistItem>
      );
      setSelectedStudio(undefined);
      setView("saved");
    });
  }, [hashVersion]);

  const updateShortlistItem = (item: SharedShortlistItem) => {
    const nextItems = {
      ...shortlistItems,
      [item.studioSlug]: item
    };
    setShortlistItems(nextItems);

    if (activeShortlistId) {
      updateSharedShortlist(
        activeShortlistId,
        Array.from(saved).map((studioSlug) => nextItems[studioSlug] ?? { studioSlug })
      ).catch(() => undefined);
    }
  };

  useEffect(() => {
    if (view === "host") {
      loadOwnerBookings().then((bookings) => {
        setOwnerBookings((current) => {
          const bookingMap = new Map(current.map((booking) => [booking.id, booking]));
          bookings.forEach((booking) => bookingMap.set(booking.id, booking));
          return Array.from(bookingMap.values());
        });
      });
    }
  }, [view]);

  useEffect(() => {
    if (view === "bookings") {
      loadCustomerBookings(lastGuestEmail).then((bookings) => {
        setCustomerBookings((current) => {
          const bookingMap = new Map(current.map((booking) => [booking.id, booking]));
          bookings.forEach((booking) => bookingMap.set(booking.id, booking));
          return Array.from(bookingMap.values());
        });
      });
    }
  }, [lastGuestEmail, view]);

  const toggleSaved = (slug: string) => {
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const openStudio = (studio: Studio) => {
    window.location.hash = `studio/${studio.slug}`;
    setSelectedStudio(studio);
    setView("explore");
  };

  const closeStudio = () => {
    window.location.hash = "explore";
    setSelectedStudio(undefined);
  };

  if (selectedStudio) {
    return (
      <StudioDetail
        studio={selectedStudio}
        isSaved={saved.has(selectedStudio.slug)}
        onBack={closeStudio}
        onBookingCreated={(booking) => {
          setLastGuestEmail(booking.guestEmail);
          setOwnerBookings((current) => [booking, ...current.filter((item) => item.id !== booking.id)]);
          setCustomerBookings((current) => [booking, ...current.filter((item) => item.id !== booking.id)]);
        }}
        onSave={() => toggleSaved(selectedStudio.slug)}
      />
    );
  }

  if (view === "bookings") {
    return (
      <CustomerBookings
        bookings={customerBookings}
        onBackToExplore={() => setView("explore")}
        onConfirmPayment={async (booking) => {
          const updated = await confirmBookingPayment(booking);
          setCustomerBookings((current) => current.map((item) => (item.id === updated.id ? updated : item)));
          setOwnerBookings((current) => current.map((item) => (item.id === updated.id ? updated : item)));
          return updated;
        }}
        onOpenSaved={() => setView("saved")}
        onOpenHost={() => setView("host")}
      />
    );
  }

  if (view === "saved") {
    const savedStudios = studios.filter((studio) => saved.has(studio.slug));

    return (
      <SavedStudios
        savedCount={saved.size}
        savedStudios={savedStudios}
        sharedShortlistId={activeShortlistId}
        shortlistItems={shortlistItems}
        onBackToExplore={() => setView("explore")}
        onChangeShortlistItem={updateShortlistItem}
        onOpenBookings={() => setView("bookings")}
        onOpenHost={() => setView("host")}
        onOpenStudio={openStudio}
        onSave={toggleSaved}
        onShortlistCreated={(shortlist) => {
          setActiveShortlistId(shortlist.id);
          setShortlistItems(
            Object.fromEntries(shortlist.items.map((item) => [item.studioSlug, item])) as Record<
              string,
              SharedShortlistItem
            >
          );
        }}
      />
    );
  }

  if (view === "host") {
    return (
      <OwnerDashboard
        bookings={ownerBookings}
        onBackToExplore={() => setView("explore")}
        onOpenSaved={() => setView("saved")}
        onOpenBookings={() => setView("bookings")}
        studio={studios[0]}
        onDecideBooking={async (booking, decision) => {
          const updated = await decideOwnerBooking(booking, decision);
          setOwnerBookings((current) => current.map((item) => (item.id === updated.id ? updated : item)));
          setCustomerBookings((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        }}
        onBlockAvailability={createOwnerAvailabilityBlock}
        onReleaseAvailability={releaseOwnerAvailabilityBlock}
        onUpdateListing={async (studio, updates) => {
          const updated = await updateOwnerListing(studio, updates);
          setStudios((current) => current.map((item) => (item.slug === updated.slug ? updated : item)));
          return updated;
        }}
      />
    );
  }

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div className="top-bar">
          <div>
            <p className="eyebrow">Prague launch</p>
            <h1>Find the right photo studio</h1>
          </div>
          <button className="icon-button" aria-label="Profile">
            <UserRound size={20} />
          </button>
        </div>

        <div className="search-card">
          <Search size={19} />
          <div>
            <strong>Prague studios</strong>
            <span>Any date · 2+ hours · photo or video</span>
          </div>
          <button className="filter-button" aria-label="Open filters">
            <SlidersHorizontal size={18} />
          </button>
        </div>
      </section>

      <section className="filter-section" aria-label="Shoot types">
        {shootTypes.map((shootType) => (
          <button
            className={`chip ${activeShootType === shootType ? "chip-active" : ""}`}
            key={shootType}
            onClick={() => setActiveShootType(activeShootType === shootType ? undefined : shootType)}
          >
            {shootTypeLabels[shootType]}
          </button>
        ))}
      </section>

      <section className="filter-section feature-row" aria-label="Studio features">
        {selectedFeatures.map((feature) => (
          <button
            className={`chip soft ${activeFeature === feature ? "chip-active" : ""}`}
            key={feature}
            onClick={() => setActiveFeature(activeFeature === feature ? undefined : feature)}
          >
            {featureLabels[feature]}
          </button>
        ))}
      </section>

      <section className="results-head">
        <div>
          <p className="eyebrow">Available studios</p>
          <h2>{studios.length} curated spaces</h2>
        </div>
        <button className="map-pill">
          <MapPin size={16} />
          Map
        </button>
      </section>

      <section className="studio-list">
        {studios.map((studio) => (
          <StudioCard
            key={studio.id}
            studio={studio}
            isSaved={saved.has(studio.slug)}
            onOpen={() => openStudio(studio)}
            onSave={() => toggleSaved(studio.slug)}
          />
        ))}
      </section>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <a className="active" href="#explore" onClick={() => setView("explore")}>
          <Search size={19} />
          Explore
        </a>
        <a href="#saved" onClick={() => setView("saved")}>
          <Heart size={19} />
          Saved
        </a>
        <a href="#bookings" onClick={() => setView("bookings")}>
          <CalendarDays size={19} />
          Bookings
        </a>
        <a href="#profile" onClick={() => setView("host")}>
          <Home size={19} />
          Host
        </a>
      </nav>
    </main>
  );
};
interface StudioCardProps {
  studio: Studio;
  isSaved: boolean;
  onOpen: () => void;
  onSave: () => void;
}

const StudioCard = ({ studio, isSaved, onOpen, onSave }: StudioCardProps) => {
  const hero = studio.images.find((image) => image.kind === "hero") ?? studio.images[0];

  return (
    <article className="studio-card">
      <button className="image-button" onClick={onOpen} aria-label={`Open ${studio.name}`}>
        <img src={hero.url} alt={hero.alt} />
      </button>
      <button className={`save-button ${isSaved ? "saved" : ""}`} onClick={onSave} aria-label="Save studio">
        <Heart size={18} fill={isSaved ? "currentColor" : "none"} />
      </button>
      <div className="card-body">
        <button className="card-title" onClick={onOpen}>
          <span>{studio.name}</span>
          <span className="rating">
            <Star size={14} fill="currentColor" />
            {studio.rating}
          </span>
        </button>
        <p>{studio.district} · {studio.tagline}</p>
        <div className="tag-row">
          {studio.moodTags.slice(0, 3).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className="price-row">
          <strong>{money(studio.priceFrom, studio.currency)}</strong>
          <span>/ hour</span>
          <span className="booking-mode">{studio.bookingMode}</span>
        </div>
      </div>
    </article>
  );
};

interface StudioDetailProps {
  studio: Studio;
  isSaved: boolean;
  onBack: () => void;
  onBookingCreated: (booking: BookingIntent) => void;
  onSave: () => void;
}

const StudioDetail = ({ studio, isSaved, onBack, onBookingCreated, onSave }: StudioDetailProps) => {
  const hero = studio.images.find((image) => image.kind === "hero") ?? studio.images[0];
  const visibleEquipment = studio.equipmentIds.slice(0, 5);
  const visibleAmenities = studio.amenityIds.slice(0, 5);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | undefined>();
  const [shareOpen, setShareOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [shootNotes, setShootNotes] = useState("");
  const [booking, setBooking] = useState<BookingIntent | undefined>();
  const bookingDate = "2026-06-12";
  const shareUrl = `${window.location.origin}/#studio/${studio.slug}`;
  const shareMessage = `Take a look at ${studio.name} in ${studio.district}. From ${money(
    studio.priceFrom,
    studio.currency
  )} / hour.`;

  useEffect(() => {
    loadAvailability(studio, bookingDate).then((availability) => {
      setSlots(availability.slots);
      setSelectedSlot(availability.slots.find((slot) => slot.available));
    });
  }, [studio]);

  const submitBooking = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSlot || !selectedSlot.available) return;

    const nextBooking = await submitBookingRequest(studio.slug, {
      roomId: selectedSlot.roomId,
      date: selectedSlot.date,
      startTime: selectedSlot.startTime,
      durationHours: selectedSlot.durationHours,
      guestName,
      guestEmail,
      shootType: "product",
      message: shootNotes
    });

    setBooking(nextBooking);
    onBookingCreated(nextBooking);
  };

  return (
    <main className="detail-shell">
      <section className="detail-hero">
        <img src={hero.url} alt={hero.alt} />
        <div className="detail-actions">
          <button className="icon-button solid" onClick={onBack} aria-label="Back to results">
            <ChevronLeft size={20} />
          </button>
          <div>
            <button
              className="icon-button solid"
              aria-label="Share studio"
              onClick={() => setShareOpen((current) => !current)}
            >
              <Share2 size={18} />
            </button>
            <button className={`icon-button solid ${isSaved ? "saved" : ""}`} onClick={onSave} aria-label="Save studio">
              <Heart size={18} fill={isSaved ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </section>

      <section className="detail-content">
        {shareOpen && (
          <section className="share-panel" aria-label="Studio sharing">
            <div>
              <p className="eyebrow">Share link</p>
              <h2>Share {studio.name}</h2>
            </div>
            <label>
              Studio link
              <input readOnly value={shareUrl} />
            </label>
            <p>{shareMessage}</p>
          </section>
        )}

        <div className="detail-title">
          <div>
            <p className="eyebrow">{studio.addressHint}</p>
            <h1>{studio.name}</h1>
          </div>
          <span className="rating large">
            <Star size={16} fill="currentColor" />
            {studio.rating}
          </span>
        </div>

        <p className="description">{studio.description}</p>

        <div className="tag-row roomy">
          {studio.moodTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>

        <section className="detail-section">
          <h2>Rooms</h2>
          {studio.rooms.map((room) => (
            <div className="room-card" key={room.id}>
              <div>
                <h3>{room.name}</h3>
                <p>{room.summary}</p>
                <span>{room.areaSqm} sqm · {room.ceilingHeightM} m ceiling · up to {room.capacity}</span>
              </div>
              <strong>{money(room.pricePerHour, studio.currency)}</strong>
            </div>
          ))}
        </section>

        <section className="detail-section">
          <h2>Included for shoots</h2>
          <div className="amenity-grid">
            {visibleEquipment.map((item) => (
              <span key={item}>
                <Sparkles size={15} />
                {equipmentLabels[item]}
              </span>
            ))}
            {visibleAmenities.map((item) => (
              <span key={item}>
                <Sparkles size={15} />
                {amenityLabels[item]}
              </span>
            ))}
          </div>
        </section>

        <section className="detail-section">
          <h2>Rules</h2>
          <ul className="rules-list">
            {studio.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>

        <section className="detail-section booking-panel" aria-label="Booking request">
          <div>
            <p className="eyebrow">Hybrid booking</p>
            <h2>Choose a time</h2>
          </div>
          <div className="slot-grid">
            {slots.slice(0, 6).map((slot) => (
              <button
                aria-label={`${slot.startTime} ${slot.roomName} ${accessibleMoney(slot.price, slot.currency)}${
                  slot.available ? "" : " unavailable"
                }`}
                className={`slot-button ${selectedSlot?.id === slot.id ? "slot-active" : ""}`}
                disabled={!slot.available}
                key={slot.id}
                onClick={() => setSelectedSlot(slot)}
                type="button"
              >
                <span>{slot.startTime}</span>
                <strong>{slot.roomName}</strong>
                <small>{slot.available ? money(slot.price, slot.currency) : "Unavailable"}</small>
              </button>
            ))}
          </div>

          <form className="booking-form" onSubmit={submitBooking}>
            <label>
              Name
              <input value={guestName} onChange={(event) => setGuestName(event.target.value)} required />
            </label>
            <label>
              Email
              <input
                type="email"
                value={guestEmail}
                onChange={(event) => setGuestEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Shoot notes
              <textarea value={shootNotes} onChange={(event) => setShootNotes(event.target.value)} required />
            </label>
            <button className="request-button" type="submit">
              Request booking
            </button>
          </form>

          {booking && (
            <p className="booking-status">
              {booking.status === "awaiting_payment"
                ? "Slot ready: continue to payment."
                : "Request sent: waiting for owner approval."}
            </p>
          )}
        </section>
      </section>

      <footer className="booking-bar">
        <div>
          <strong>{money(studio.priceFrom, studio.currency)}</strong>
          <span>/ hour · {studio.bookingMode}</span>
        </div>
        <button>Check availability</button>
      </footer>
    </main>
  );
};

interface OwnerDashboardProps {
  bookings: BookingIntent[];
  studio?: Studio;
  onBackToExplore: () => void;
  onOpenSaved: () => void;
  onOpenBookings: () => void;
  onDecideBooking: (booking: BookingIntent, decision: "approve" | "decline") => Promise<void>;
  onBlockAvailability: (block: Omit<OwnerAvailabilityBlock, "id">) => Promise<OwnerAvailabilityBlock>;
  onReleaseAvailability: (blockId: string) => Promise<void>;
  onUpdateListing: (studio: Studio, updates: OwnerListingUpdate) => Promise<Studio>;
}

const statusLabel = (status: BookingIntent["status"]) => {
  const labels: Record<BookingIntent["status"], string> = {
    pending_owner_approval: "Needs review",
    awaiting_payment: "Awaiting payment",
    confirmed: "Confirmed",
    declined: "Declined",
    cancelled: "Cancelled",
    completed: "Completed"
  };

  return labels[status];
};

interface CustomerBookingsProps {
  bookings: BookingIntent[];
  onBackToExplore: () => void;
  onConfirmPayment: (booking: BookingIntent) => Promise<BookingIntent>;
  onOpenSaved: () => void;
  onOpenHost: () => void;
}

const CustomerBookings = ({
  bookings,
  onBackToExplore,
  onConfirmPayment,
  onOpenSaved,
  onOpenHost
}: CustomerBookingsProps) => {
  const [confirmedPaymentFor, setConfirmedPaymentFor] = useState<string | undefined>();

  return (
    <main className="app-shell bookings-shell">
      <section className="hero-band owner-hero">
        <div className="top-bar">
          <div>
            <p className="eyebrow">Your shoot plans</p>
            <h1>My bookings</h1>
          </div>
          <button className="icon-button" aria-label="Back to explore" onClick={onBackToExplore}>
            <Search size={20} />
          </button>
        </div>
        <div className="owner-summary">
          <CalendarDays size={20} />
          <div>
            <strong>{bookings.length} bookings</strong>
            <span>Track requests, approvals, and payment steps.</span>
          </div>
        </div>
      </section>

      <section className="owner-list" aria-label="Customer bookings">
        {bookings.length === 0 ? (
          <div className="empty-state">
            <h2>No bookings yet</h2>
            <p>Your studio requests will appear here after you choose a time.</p>
          </div>
        ) : (
          bookings.map((booking) => (
            <article className="owner-request" key={booking.id}>
              <div className="owner-request-head">
                <div>
                  <p className="eyebrow">{booking.date} at {booking.startTime}</p>
                  <h2>{booking.studioName}</h2>
                </div>
                <span className={`status-pill ${booking.status}`}>{statusLabel(booking.status)}</span>
              </div>
              <p>
                {booking.roomName} · {booking.durationHours}h · {money(booking.totalPrice, booking.currency)}
              </p>
              <p className="owner-message">{booking.message}</p>

              {booking.status === "awaiting_payment" && (
                <button
                  className="payment-button"
                  aria-label={`Continue to payment for ${booking.studioName}`}
                  onClick={async () => {
                    const updated = await onConfirmPayment(booking);
                    setConfirmedPaymentFor(updated.id);
                  }}
                >
                  <CreditCard size={17} />
                  Continue to payment
                </button>
              )}

              {confirmedPaymentFor === booking.id && (
                <p className="booking-status">Payment captured: booking confirmed.</p>
              )}
            </article>
          ))
        )}
      </section>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <a href="#explore" onClick={onBackToExplore}>
          <Search size={19} />
          Explore
        </a>
        <a href="#saved" onClick={onOpenSaved}>
          <Heart size={19} />
          Saved
        </a>
        <a className="active" href="#bookings">
          <CalendarDays size={19} />
          Bookings
        </a>
        <a href="#profile" onClick={onOpenHost}>
          <Home size={19} />
          Host
        </a>
      </nav>
    </main>
  );
};

interface SavedStudiosProps {
  savedCount: number;
  savedStudios: Studio[];
  sharedShortlistId?: string;
  shortlistItems: Record<string, SharedShortlistItem>;
  onBackToExplore: () => void;
  onChangeShortlistItem: (item: SharedShortlistItem) => void;
  onOpenBookings: () => void;
  onOpenHost: () => void;
  onOpenStudio: (studio: Studio) => void;
  onSave: (slug: string) => void;
  onShortlistCreated: (shortlist: { id: string; items: SharedShortlistItem[] }) => void;
}

const SavedStudios = ({
  savedCount,
  savedStudios,
  sharedShortlistId,
  shortlistItems,
  onBackToExplore,
  onChangeShortlistItem,
  onOpenBookings,
  onOpenHost,
  onOpenStudio,
  onSave,
  onShortlistCreated
}: SavedStudiosProps) => {
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "creating">("idle");
  const shareUrl = sharedShortlistId
    ? `${window.location.origin}/#shortlist/${sharedShortlistId}`
    : `${window.location.origin}/#saved/${savedStudios.map((studio) => studio.slug).join(",")}`;
  const shareMessage = `Compare ${savedStudios.length} Prague studios: ${savedStudios
    .map((studio) => studio.name)
    .join(", ")}.`;
  const createShare = async () => {
    if (shareOpen) {
      setShareOpen(false);
      return;
    }

    setShareOpen(true);
    if (sharedShortlistId) return;

    setShareStatus("creating");
    const shortlist = await createSharedShortlist(
      savedStudios.map((studio) => studio.slug),
      savedStudios.map((studio) => shortlistItems[studio.slug] ?? { studioSlug: studio.slug })
    );
    onShortlistCreated(shortlist);
    setShareStatus("idle");
  };
  const updateDecision = (studio: Studio, decision: ShortlistDecision) => {
    onChangeShortlistItem({
      ...shortlistItems[studio.slug],
      studioSlug: studio.slug,
      decision
    });
  };
  const updateNote = (studio: Studio, note: string) => {
    onChangeShortlistItem({
      ...shortlistItems[studio.slug],
      studioSlug: studio.slug,
      note
    });
  };

  return (
    <main className="app-shell saved-shell">
      <section className="hero-band owner-hero">
        <div className="top-bar">
          <div>
            <p className="eyebrow">Shortlist</p>
            <h1>Saved studios</h1>
          </div>
          <button className="icon-button" aria-label="Back to explore" onClick={onBackToExplore}>
            <Search size={20} />
          </button>
        </div>
        <div className="owner-summary">
          <Heart size={20} />
          <div>
            <strong>{savedCount} saved</strong>
            <span>Keep a shortlist to share with a photographer or client.</span>
          </div>
        </div>
      </section>

      {savedStudios.length === 0 ? (
        <section className="owner-list">
          <div className="empty-state">
            <h2>No saved studios yet</h2>
            <p>Tap the heart on any studio to build a shortlist for the shoot.</p>
          </div>
        </section>
      ) : (
        <>
          <section className="shortlist-share">
            <button className="secondary-button" onClick={createShare} type="button">
              <Share2 size={17} />
              {shareStatus === "creating" ? "Creating shortlist" : "Share saved shortlist"}
            </button>
            {shareOpen && (
              <section className="share-panel" aria-label="Saved shortlist sharing">
                <div>
                  <p className="eyebrow">Share shortlist</p>
                  <h2>Share saved shortlist</h2>
                </div>
                <label>
                  Shortlist link
                  <input readOnly value={shareUrl} />
                </label>
                {sharedShortlistId && <p className="booking-status">Saved shortlist ready for sharing.</p>}
                <p>{shareMessage}</p>
              </section>
            )}
          </section>
          <section className="studio-list saved-list" aria-label="Saved studios list">
            {savedStudios.map((studio) => {
              const shortlistItem = shortlistItems[studio.slug];

              return (
                <article className="shortlist-card" key={studio.id}>
                  <StudioCard
                    studio={studio}
                    isSaved
                    onOpen={() => onOpenStudio(studio)}
                    onSave={() => onSave(studio.slug)}
                  />
                  <section className="shortlist-collaboration" aria-label={`Shortlist notes for ${studio.name}`}>
                    <div className="decision-row" aria-label={`Decision status for ${studio.name}`}>
                      {(Object.keys(shortlistDecisionLabels) as ShortlistDecision[]).map((decision) => (
                        <button
                          className={`decision-button ${shortlistItem?.decision === decision ? "decision-active" : ""}`}
                          key={decision}
                          onClick={() => updateDecision(studio, decision)}
                          type="button"
                          aria-label={`Mark ${studio.name} as ${decision}`}
                        >
                          {shortlistDecisionLabels[decision]}
                        </button>
                      ))}
                    </div>
                    {shortlistItem?.decision && (
                      <p className="decision-summary">Status: {shortlistDecisionLabels[shortlistItem.decision]}</p>
                    )}
                    <label>
                      Note for {studio.name}
                      <textarea
                        value={shortlistItem?.note ?? ""}
                        onChange={(event) => updateNote(studio, event.target.value)}
                        placeholder="Add a client or photographer note"
                      />
                    </label>
                    {shortlistItem?.note && <p className="shortlist-note">{shortlistItem.note}</p>}
                  </section>
                </article>
              );
            })}
          </section>
        </>
      )}

      <nav className="bottom-nav" aria-label="Primary navigation">
        <a href="#explore" onClick={onBackToExplore}>
          <Search size={19} />
          Explore
        </a>
        <a className="active" href="#saved">
          <Heart size={19} />
          Saved
        </a>
        <a href="#bookings" onClick={onOpenBookings}>
          <CalendarDays size={19} />
          Bookings
        </a>
        <a href="#profile" onClick={onOpenHost}>
          <Home size={19} />
          Host
        </a>
      </nav>
    </main>
  );
};

const OwnerDashboard = ({
  bookings,
  studio,
  onBackToExplore,
  onOpenSaved,
  onOpenBookings,
  onDecideBooking,
  onBlockAvailability,
  onReleaseAvailability,
  onUpdateListing
}: OwnerDashboardProps) => {
  const [activeTab, setActiveTab] = useState<"requests" | "calendar" | "listing">("requests");

  return (
    <main className="app-shell owner-shell">
      <section className="hero-band owner-hero">
        <div className="top-bar">
          <div>
            <p className="eyebrow">Studio owners</p>
            <h1>
              {activeTab === "requests" ? "Owner inbox" : activeTab === "calendar" ? "Calendar" : "Manage listing"}
            </h1>
          </div>
          <button className="icon-button" aria-label="Back to explore" onClick={onBackToExplore}>
            <Search size={20} />
          </button>
        </div>
        <div className="owner-summary">
          {activeTab === "requests" ? <Inbox size={20} /> : activeTab === "calendar" ? <CalendarDays size={20} /> : <Home size={20} />}
          <div>
            <strong>
              {activeTab === "requests"
                ? `${bookings.length} requests`
                : activeTab === "calendar"
                  ? "Availability controls"
                  : studio?.name ?? "Studio listing"}
            </strong>
            <span>
              {activeTab === "requests"
                ? "Review holds before payment collection."
                : activeTab === "calendar"
                  ? "Block maintenance, private shoots, and owner holds."
                : "Keep the public studio profile ready for photographers and clients."}
            </span>
          </div>
        </div>
        <div className="owner-tabs" role="group" aria-label="Owner dashboard sections">
          <button
            className={activeTab === "requests" ? "active" : ""}
            onClick={() => setActiveTab("requests")}
            type="button"
          >
            Requests
          </button>
          <button
            className={activeTab === "calendar" ? "active" : ""}
            onClick={() => setActiveTab("calendar")}
            type="button"
          >
            Calendar
          </button>
          <button
            className={activeTab === "listing" ? "active" : ""}
            onClick={() => setActiveTab("listing")}
            type="button"
          >
            Listing
          </button>
        </div>
      </section>

      {activeTab === "requests" ? (
        <OwnerRequests bookings={bookings} onDecideBooking={onDecideBooking} />
      ) : activeTab === "calendar" && studio ? (
        <OwnerCalendar
          studio={studio}
          onBlockAvailability={onBlockAvailability}
          onReleaseAvailability={onReleaseAvailability}
        />
      ) : studio ? (
        <OwnerListingEditor studio={studio} onUpdateListing={onUpdateListing} />
      ) : (
        <section className="owner-list">
          <div className="empty-state">
            <h2>No listing loaded</h2>
            <p>The studio profile will appear here after the catalog loads.</p>
          </div>
        </section>
      )}

      <nav className="bottom-nav" aria-label="Primary navigation">
        <a href="#explore" onClick={onBackToExplore}>
          <Search size={19} />
          Explore
        </a>
        <a href="#saved" onClick={onOpenSaved}>
          <Heart size={19} />
          Saved
        </a>
        <a href="#bookings" onClick={onOpenBookings}>
          <CalendarDays size={19} />
          Bookings
        </a>
        <a className="active" href="#profile">
          <Home size={19} />
          Host
        </a>
      </nav>
    </main>
  );
};

interface OwnerRequestsProps {
  bookings: BookingIntent[];
  onDecideBooking: (booking: BookingIntent, decision: "approve" | "decline") => Promise<void>;
}

const OwnerRequests = ({ bookings, onDecideBooking }: OwnerRequestsProps) => (
  <section className="owner-list" aria-label="Owner booking requests">
    {bookings.length === 0 ? (
      <div className="empty-state">
        <h2>No requests yet</h2>
        <p>New booking requests will appear here after a photographer or client asks for a studio time.</p>
      </div>
    ) : (
      bookings.map((booking) => (
        <article className="owner-request" key={booking.id}>
          <div className="owner-request-head">
            <div>
              <p className="eyebrow">{booking.studioName}</p>
              <h2>{booking.guestName}</h2>
            </div>
            <span className={`status-pill ${booking.status}`}>{statusLabel(booking.status)}</span>
          </div>
          <p>
            {booking.roomName} - {booking.date} at {booking.startTime} - {booking.durationHours}h
          </p>
          <p className="owner-message">{booking.message}</p>
          <strong>{money(booking.totalPrice, booking.currency)}</strong>

          {booking.status === "pending_owner_approval" && (
            <div className="owner-actions">
              <button
                className="approve-button"
                aria-label={`Approve ${booking.guestName} booking`}
                onClick={() => onDecideBooking(booking, "approve")}
              >
                <Check size={17} />
                Approve
              </button>
              <button
                className="decline-button"
                aria-label={`Decline ${booking.guestName} booking`}
                onClick={() => onDecideBooking(booking, "decline")}
              >
                <X size={17} />
                Decline
              </button>
            </div>
          )}
        </article>
      ))
    )}
  </section>
);

interface OwnerCalendarProps {
  studio: Studio;
  onBlockAvailability: (block: Omit<OwnerAvailabilityBlock, "id">) => Promise<OwnerAvailabilityBlock>;
  onReleaseAvailability: (blockId: string) => Promise<void>;
}

const OwnerCalendar = ({ studio, onBlockAvailability, onReleaseAvailability }: OwnerCalendarProps) => {
  const [roomId, setRoomId] = useState(studio.rooms[0]?.id ?? "");
  const [date, setDate] = useState("2026-06-12");
  const [startTime, setStartTime] = useState("09:00");
  const [reason, setReason] = useState("");
  const [blocks, setBlocks] = useState<OwnerAvailabilityBlock[]>([]);
  const selectedRoom = studio.rooms.find((room) => room.id === roomId) ?? studio.rooms[0];

  const blockSlot = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedRoom) return;

    const block = await onBlockAvailability({
      studioSlug: studio.slug,
      roomId: selectedRoom.id,
      date,
      startTime,
      reason: reason.trim() || "Owner hold"
    });
    setBlocks((current) => [block, ...current]);
    setReason("");
  };

  const releaseBlock = async (block: OwnerAvailabilityBlock) => {
    await onReleaseAvailability(block.id);
    setBlocks((current) => current.filter((currentBlock) => currentBlock.id !== block.id));
  };

  return (
    <section className="owner-list calendar-editor" aria-label="Owner calendar">
      <article className="listing-preview">
        <CalendarDays size={28} />
        <div>
          <p className="eyebrow">{studio.name}</p>
          <h2>Availability holds</h2>
          <p>Block public booking slots for maintenance, private shoots, or owner use.</p>
        </div>
      </article>

      <form className="booking-form listing-form" onSubmit={blockSlot}>
        <label>
          Room
          <select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
            {studio.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input value={date} onChange={(event) => setDate(event.target.value)} type="date" />
        </label>
        <label>
          Start time
          <select value={startTime} onChange={(event) => setStartTime(event.target.value)}>
            {["09:00", "11:00", "13:00", "15:00"].map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </label>
        <label>
          Block reason
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Maintenance" />
        </label>
        <button className="request-button" type="submit">
          Block selected slot
        </button>
      </form>

      {blocks.map((block) => {
        const room = studio.rooms.find((candidate) => candidate.id === block.roomId);
        return (
          <article className="owner-request" key={block.id}>
            <div className="owner-request-head">
              <div>
                <p className="eyebrow">{block.date}</p>
                <h2>
                  {block.startTime} {room?.name ?? "Room"} blocked.
                </h2>
              </div>
              <span className="status-pill">Blocked</span>
            </div>
            <p className="owner-message">{block.reason}</p>
            <button
              aria-label={`Release ${block.startTime} ${room?.name ?? "Room"} block`}
              className="secondary-button"
              onClick={() => releaseBlock(block)}
              type="button"
            >
              Release block
            </button>
          </article>
        );
      })}
    </section>
  );
};

interface OwnerListingEditorProps {
  studio: Studio;
  onUpdateListing: (studio: Studio, updates: OwnerListingUpdate) => Promise<Studio>;
}

const OwnerListingEditor = ({ studio, onUpdateListing }: OwnerListingEditorProps) => {
  const hero = studio.images.find((image) => image.kind === "hero") ?? studio.images[0];
  const [aiDraft, setAiDraft] = useState("");
  const [tagline, setTagline] = useState(studio.tagline);
  const [description, setDescription] = useState(studio.description);
  const [priceFrom, setPriceFrom] = useState(String(studio.priceFrom));
  const [bookingMode, setBookingMode] = useState<BookingMode>(studio.bookingMode);
  const [shootTypes, setShootTypes] = useState<ShootType[]>(studio.shootTypes);
  const [featureIds, setFeatureIds] = useState<FeatureId[]>(studio.featureIds);
  const [equipmentIds, setEquipmentIds] = useState<EquipmentId[]>(studio.equipmentIds);
  const [amenityIds, setAmenityIds] = useState<AmenityId[]>(studio.amenityIds);
  const [images, setImages] = useState<StudioImage[]>(studio.images);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [mediaKind, setMediaKind] = useState<StudioImage["kind"]>("room");
  const [rules, setRules] = useState(studio.rules.join("\n"));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTagline(studio.tagline);
    setDescription(studio.description);
    setPriceFrom(String(studio.priceFrom));
    setBookingMode(studio.bookingMode);
    setShootTypes(studio.shootTypes);
    setFeatureIds(studio.featureIds);
    setEquipmentIds(studio.equipmentIds);
    setAmenityIds(studio.amenityIds);
    setImages(studio.images);
    setRules(studio.rules.join("\n"));
  }, [studio]);

  const generateDraft = () => {
    const draft = draftListingFromTranscript(aiDraft);
    setTagline(draft.tagline);
    setDescription(draft.description);
    if (draft.shootTypes.length) setShootTypes(draft.shootTypes);
    if (draft.featureIds.length) setFeatureIds(draft.featureIds);
    if (draft.equipmentIds.length) setEquipmentIds(draft.equipmentIds);
    if (draft.amenityIds.length) setAmenityIds(draft.amenityIds);
    if (draft.rules.length) setRules(draft.rules.join("\n"));
  };

  const toggleShootType = (shootType: ShootType) => {
    setShootTypes((current) =>
      current.includes(shootType) ? current.filter((item) => item !== shootType) : [...current, shootType]
    );
  };

  const toggleFeature = (feature: FeatureId) => {
    setFeatureIds((current) =>
      current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature]
    );
  };

  const toggleEquipment = (equipment: EquipmentId) => {
    setEquipmentIds((current) =>
      current.includes(equipment) ? current.filter((item) => item !== equipment) : [...current, equipment]
    );
  };

  const toggleAmenity = (amenity: AmenityId) => {
    setAmenityIds((current) =>
      current.includes(amenity) ? current.filter((item) => item !== amenity) : [...current, amenity]
    );
  };

  const addMedia = () => {
    const trimmedUrl = mediaUrl.trim();
    const trimmedCaption = mediaCaption.trim();
    if (!trimmedUrl || !trimmedCaption) return;

    setImages((current) => [
      ...current,
      {
        id: `owner-media-${Date.now()}`,
        url: trimmedUrl,
        alt: trimmedCaption,
        kind: mediaKind
      }
    ]);
    setMediaUrl("");
    setMediaCaption("");
    setMediaKind("room");
  };

  const submitListing = async (event: FormEvent) => {
    event.preventDefault();
    const updatedRules = rules
      .split("\n")
      .map((rule) => rule.trim())
      .filter(Boolean);

    await onUpdateListing(studio, {
      tagline,
      description,
      priceFrom: Number(priceFrom),
      bookingMode,
      shootTypes,
      featureIds,
      equipmentIds,
      amenityIds,
      images,
      rules: updatedRules
    });
    setSaved(true);
  };

  return (
    <section className="owner-list listing-editor" aria-label="Owner listing editor">
      <article className="listing-preview">
        <img src={hero.url} alt={hero.alt} />
        <div>
          <p className="eyebrow">{studio.district}</p>
          <h2>{studio.name}</h2>
          <p>{studio.tagline}</p>
          <strong>{money(studio.priceFrom, studio.currency)} / hour</strong>
          <div className="tag-row">
            <span>{studio.bookingMode}</span>
            <span>{studio.rooms.length} rooms</span>
            <span>{studio.equipmentIds.length} equipment items</span>
          </div>
        </div>
      </article>

      <article className="listing-checklist">
        <h2>Readiness</h2>
        <div>
          <span><Check size={15} /> Hero photo</span>
          <span><Check size={15} /> Rooms and pricing</span>
          <span><Check size={15} /> Equipment list</span>
          <span><Check size={15} /> House rules</span>
        </div>
      </article>

      <article className="ai-draft-panel">
        <div>
          <p className="eyebrow">AI assistant</p>
          <h2>Draft from voice notes</h2>
          <p>Paste a transcript now; this is ready to connect to speech and OpenAI later.</p>
        </div>
        <label>
          AI voice or text draft
          <textarea
            value={aiDraft}
            onChange={(event) => setAiDraft(event.target.value)}
            placeholder="Describe rooms, light, equipment, props, rules, and shoot types."
          />
        </label>
        <button className="request-button" onClick={generateDraft} type="button">
          Generate listing draft
        </button>
      </article>

      <form className="booking-form listing-form" onSubmit={submitListing}>
        <label>
          Listing tagline
          <input value={tagline} onChange={(event) => setTagline(event.target.value)} required />
        </label>
        <label>
          Listing description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} required />
        </label>
        <section className="detected-filters" aria-label="Detected listing filters">
          <h2>Detected filters</h2>
          <div>
            {shootTypes.map((shootType) => (
              <span key={shootType}>{shootTypeLabels[shootType]}</span>
            ))}
            {featureIds.map((feature) => (
              <span key={feature}>{featureLabels[feature]}</span>
            ))}
            {equipmentIds.map((equipment) => (
              <span key={equipment}>{equipmentLabels[equipment]}</span>
            ))}
            {amenityIds.map((amenity) => (
              <span key={amenity}>{amenityLabels[amenity]}</span>
            ))}
          </div>
        </section>
        <section className="filter-editor" aria-label="Editable listing filters">
          <h2>Refine filters</h2>
          <div className="filter-group">
            <h3>Shoot types</h3>
            <div>
              {shootTypeOptions.map(([shootType, label]) => {
                const active = shootTypes.includes(shootType);
                return (
                  <button
                    aria-label={`${active ? "Remove" : "Add"} ${label} shoot type`}
                    className={`filter-toggle ${active ? "active" : ""}`}
                    key={shootType}
                    onClick={() => toggleShootType(shootType)}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="filter-group">
            <h3>Features</h3>
            <div>
              {featureOptions.map(([feature, label]) => {
                const active = featureIds.includes(feature);
                return (
                  <button
                    aria-label={`${active ? "Remove" : "Add"} ${label} feature`}
                    className={`filter-toggle ${active ? "active" : ""}`}
                    key={feature}
                    onClick={() => toggleFeature(feature)}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="filter-group">
            <h3>Equipment</h3>
            <div>
              {equipmentOptions.map(([equipment, label]) => {
                const active = equipmentIds.includes(equipment);
                return (
                  <button
                    aria-label={`${active ? "Remove" : "Add"} ${label} equipment`}
                    className={`filter-toggle ${active ? "active" : ""}`}
                    key={equipment}
                    onClick={() => toggleEquipment(equipment)}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="filter-group">
            <h3>Amenities</h3>
            <div>
              {amenityOptions.map(([amenity, label]) => {
                const active = amenityIds.includes(amenity);
                return (
                  <button
                    aria-label={`${active ? "Remove" : "Add"} ${label} amenity`}
                    className={`filter-toggle ${active ? "active" : ""}`}
                    key={amenity}
                    onClick={() => toggleAmenity(amenity)}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
        <section className="media-editor" aria-label="Studio media library">
          <h2>Studio media</h2>
          <div className="media-grid">
            {images.map((image) => (
              <article className="media-card" key={image.id}>
                <img src={image.url} alt={image.alt} />
                <div>
                  <span>{mediaKindLabels[image.kind]}</span>
                  <p>{image.alt}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="media-form">
            <label>
              Media URL
              <input
                value={mediaUrl}
                onChange={(event) => setMediaUrl(event.target.value)}
                placeholder="https://..."
                type="url"
              />
            </label>
            <label>
              Media caption
              <input
                value={mediaCaption}
                onChange={(event) => setMediaCaption(event.target.value)}
                placeholder="Describe what clients see"
              />
            </label>
            <label>
              Media category
              <select value={mediaKind} onChange={(event) => setMediaKind(event.target.value as StudioImage["kind"])}>
                <option value="hero">Hero</option>
                <option value="room">Rooms</option>
                <option value="example">Example shoots</option>
                <option value="equipment">Equipment and props</option>
              </select>
            </label>
            <button className="secondary-button" onClick={addMedia} type="button">
              Add media
            </button>
          </div>
        </section>
        <label>
          Starting price
          <input
            min="1"
            type="number"
            value={priceFrom}
            onChange={(event) => setPriceFrom(event.target.value)}
            required
          />
        </label>
        <label>
          Booking mode
          <select value={bookingMode} onChange={(event) => setBookingMode(event.target.value as BookingMode)}>
            <option value="hybrid">Hybrid</option>
            <option value="request">Request</option>
            <option value="instant">Instant</option>
          </select>
        </label>
        <label>
          Rules
          <textarea value={rules} onChange={(event) => setRules(event.target.value)} required />
        </label>
        <button className="request-button" type="submit">
          Save listing changes
        </button>
      </form>

      {saved && <p className="booking-status">Listing updated.</p>}
    </section>
  );
};
