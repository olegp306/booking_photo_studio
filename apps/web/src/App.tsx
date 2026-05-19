import {
  CalendarDays,
  ChevronLeft,
  Heart,
  Home,
  MapPin,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
  UserRound
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  amenityLabels,
  equipmentLabels,
  featureLabels,
  shootTypeLabels,
  type AvailabilitySlot,
  type BookingIntent,
  type FeatureId,
  type ShootType,
  type Studio,
  type StudioSearchFilters
} from "@studio-market/shared";
import { loadAvailability, loadStudios, submitBookingRequest } from "./api";

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

export const App = () => {
  const [studios, setStudios] = useState<Studio[]>([]);
  const [activeShootType, setActiveShootType] = useState<ShootType | undefined>();
  const [activeFeature, setActiveFeature] = useState<FeatureId | undefined>();
  const [selectedStudio, setSelectedStudio] = useState<Studio | undefined>();
  const [saved, setSaved] = useState<Set<string>>(new Set());

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

  const toggleSaved = (slug: string) => {
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  if (selectedStudio) {
    return (
      <StudioDetail
        studio={selectedStudio}
        isSaved={saved.has(selectedStudio.slug)}
        onBack={() => setSelectedStudio(undefined)}
        onSave={() => toggleSaved(selectedStudio.slug)}
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
            onOpen={() => setSelectedStudio(studio)}
            onSave={() => toggleSaved(studio.slug)}
          />
        ))}
      </section>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <a className="active" href="#explore">
          <Search size={19} />
          Explore
        </a>
        <a href="#saved">
          <Heart size={19} />
          Saved
        </a>
        <a href="#bookings">
          <CalendarDays size={19} />
          Bookings
        </a>
        <a href="#profile">
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
  onSave: () => void;
}

const StudioDetail = ({ studio, isSaved, onBack, onSave }: StudioDetailProps) => {
  const hero = studio.images.find((image) => image.kind === "hero") ?? studio.images[0];
  const visibleEquipment = studio.equipmentIds.slice(0, 5);
  const visibleAmenities = studio.amenityIds.slice(0, 5);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | undefined>();
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [shootNotes, setShootNotes] = useState("");
  const [booking, setBooking] = useState<BookingIntent | undefined>();
  const bookingDate = "2026-06-12";

  useEffect(() => {
    loadAvailability(studio, bookingDate).then((availability) => {
      setSlots(availability.slots);
      setSelectedSlot(availability.slots[0]);
    });
  }, [studio]);

  const submitBooking = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSlot) return;

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
            <button className="icon-button solid" aria-label="Share studio">
              <Share2 size={18} />
            </button>
            <button className={`icon-button solid ${isSaved ? "saved" : ""}`} onClick={onSave} aria-label="Save studio">
              <Heart size={18} fill={isSaved ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </section>

      <section className="detail-content">
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
                aria-label={`${slot.startTime} ${slot.roomName} ${accessibleMoney(slot.price, slot.currency)}`}
                className={`slot-button ${selectedSlot?.id === slot.id ? "slot-active" : ""}`}
                key={slot.id}
                onClick={() => setSelectedSlot(slot)}
                type="button"
              >
                <span>{slot.startTime}</span>
                <strong>{slot.roomName}</strong>
                <small>{money(slot.price, slot.currency)}</small>
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
