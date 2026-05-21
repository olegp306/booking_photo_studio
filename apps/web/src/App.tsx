import {
  CalendarDays,
  Check,
  ChevronLeft,
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
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  amenityLabels,
  equipmentLabels,
  featureLabels,
  shootTypeLabels,
  type AvailabilitySlot,
  type BookingMode,
  type BookingIntent,
  type AmenityId,
  type EquipmentId,
  type FeatureId,
  type ListingDraft,
  type ListingStatus,
  type OwnerAvailabilityBlock,
  type OwnerMedia,
  type OwnerOnboardingDraft,
  type OwnerListingUpdate,
  type PublishedStudioListing,
  type SharedShortlistItem,
  type ShortlistDecision,
  type ShootType,
  type Studio,
  type StudioImage,
  type StudioRoom,
  type StudioSearchFilters
} from "@studio-market/shared";
import {
  completeOwnerBooking,
  createOwnerAvailabilityBlock,
  createSharedShortlist,
  createSupportTicket,
  decideListingReview,
  decideOwnerBooking,
  generateListingDraft,
  loadListingReviews,
  loadSession,
  loadAvailability,
  loadCustomerBookings,
  loadLaunchReadiness,
  loadOwnerListingDrafts,
  loadOwnerAvailabilityBlocks,
  loadOwnerBookings,
  loadReferralSummary,
  loadSharedShortlist,
  loadStudios,
  loadSupportTickets,
  loadTelegramMiniAppDrafts,
  publishOwnerDraft,
  releaseOwnerAvailabilityBlock,
  setupTelegramWebhook,
  startOwnerOnboarding,
  submitBookingReview,
  submitBookingRequest,
  suggestMediaDetails as suggestMediaDetailsFromApi,
  trackReferralSource,
  updateOwnerListing,
  updateSessionRole,
  updateSharedShortlist,
  uploadOwnerMedia,
  requestOwnerEmailCode,
  verifyOwnerEmailCode,
  type ImportedListingDraft,
  type ListingReviewDecision,
  type ListingReviewItem,
  type MediaSuggestionResult,
  type LaunchReadiness,
  type ReferralSource,
  type ReferralSummary,
  type SupportEvent,
  type SupportTicket,
  type UserRole,
  type UserSession
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

const listingStatusLabels: Record<ListingStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  published: "Published"
};

const addDays = (dateValue: string, days: number) => {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

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
type ExtendedAppView = AppView | "telegram-drafts";
type OwnerDashboardTab = "requests" | "calendar" | "listing" | "support" | "launch";
type BookingMessageAuthor = "guest" | "studio";

interface BookingMessage {
  id: string;
  author: BookingMessageAuthor;
  authorLabel: string;
  body: string;
}

const shortlistDecisionLabels: Record<ShortlistDecision, string> = {
  favourite: "Favourite",
  backup: "Backup",
  rejected: "Rejected"
};
const roleLabels: Record<UserRole, string> = {
  client: "Client",
  photographer: "Photographer",
  studio_owner: "Studio owner",
  admin: "Admin"
};
const roleOptions: UserRole[] = ["client", "photographer", "studio_owner"];
const referralSourceLabels: Record<ReferralSource, string> = {
  telegram: "Telegram",
  photographer: "Photographer",
  studio_owner: "Studio owner",
  direct: "Direct",
  unknown: "Unknown"
};

const initialViewFromHash = (): ExtendedAppView => {
  if (window.location.hash.startsWith("#telegram-drafts")) return "telegram-drafts";
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

const referralSourceFromLocation = (): ReferralSource | undefined => {
  const source = new URLSearchParams(window.location.search).get("ref");

  if (source === "telegram" || source === "photographer" || source === "studio_owner" || source === "direct") {
    return source;
  }

  return undefined;
};

export const App = () => {
  const [studios, setStudios] = useState<Studio[]>([]);
  const [activeShootType, setActiveShootType] = useState<ShootType | undefined>();
  const [activeFeature, setActiveFeature] = useState<FeatureId | undefined>();
  const [selectedStudio, setSelectedStudio] = useState<Studio | undefined>();
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [view, setView] = useState<ExtendedAppView>(initialViewFromHash);
  const [ownerBookings, setOwnerBookings] = useState<BookingIntent[]>([]);
  const [customerBookings, setCustomerBookings] = useState<BookingIntent[]>([]);
  const [bookingMessages, setBookingMessages] = useState<Record<string, BookingMessage[]>>({});
  const [lastGuestEmail, setLastGuestEmail] = useState<string | undefined>();
  const [hashVersion, setHashVersion] = useState(0);
  const [shortlistItems, setShortlistItems] = useState<Record<string, SharedShortlistItem>>({});
  const [activeShortlistId, setActiveShortlistId] = useState<string | undefined>();
  const [ownerInitialTab, setOwnerInitialTab] = useState<OwnerDashboardTab>("requests");
  const [supportOpen, setSupportOpen] = useState(false);
  const [ownerOnboardingOpen, setOwnerOnboardingOpen] = useState(false);
  const [supportEvents, setSupportEvents] = useState<SupportEvent[]>([]);
  const [session, setSession] = useState<UserSession>({
    id: "demo-session",
    role: "photographer",
    displayName: "Marta Photographer"
  });

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
    loadSession().then(setSession);
  }, []);

  useEffect(() => {
    const source = referralSourceFromLocation();
    if (!source) return;

    trackReferralSource(source, `${window.location.search}${window.location.hash}`).catch(() => undefined);
  }, []);

  useEffect(() => {
    const handleHashChange = () => setHashVersion((current) => current + 1);
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (window.location.hash.startsWith("#telegram-drafts")) {
      setSelectedStudio(undefined);
      setView("telegram-drafts");
    }
  }, [hashVersion]);

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

  const sendBookingMessage = (booking: BookingIntent, author: BookingMessageAuthor, body: string) => {
    const trimmedBody = body.trim();
    if (!trimmedBody) return;

    const authorLabel = author === "guest" ? booking.guestName : "Studio";
    setBookingMessages((current) => ({
      ...current,
      [booking.id]: [
        ...(current[booking.id] ?? []),
        {
          id: `${booking.id}-${author}-${Date.now()}`,
          author,
          authorLabel,
          body: trimmedBody
        }
      ]
    }));
  };

  const trackSupportEvent = (type: string, label: string, metadata?: SupportEvent["metadata"]) => {
    setSupportEvents((current) =>
      [
        {
          id: `support-event-${Date.now()}`,
          type,
          label,
          metadata,
          createdAt: new Date().toISOString()
        },
        ...current
      ].slice(0, 30)
    );
  };

  const openStudio = (studio: Studio) => {
    trackSupportEvent("open_studio", `Opened ${studio.name}`, { studioSlug: studio.slug });
    window.location.hash = `studio/${studio.slug}`;
    setSelectedStudio(studio);
    setView("explore");
  };

  const closeStudio = () => {
    window.location.hash = "explore";
    setSelectedStudio(undefined);
  };

  const changeSessionRole = async (role: UserRole) => {
    const updated = await updateSessionRole(role);
    setSession(updated);
  };

  const supportLayer = (
    <>
      <OwnerOnboardingLayer
        isOpen={ownerOnboardingOpen}
        onClose={() => setOwnerOnboardingOpen(false)}
        onOpen={() => setOwnerOnboardingOpen(true)}
      />
      <SupportLayer
        events={supportEvents}
        isOpen={supportOpen}
        onClose={() => setSupportOpen(false)}
        onOpen={() => setSupportOpen(true)}
        relatedStudioSlug={selectedStudio?.slug}
        screen={window.location.hash || "#explore"}
      />
    </>
  );

  if (selectedStudio) {
    return (
      <>
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
        {supportLayer}
      </>
    );
  }

  if (view === "bookings") {
    return (
      <>
        <CustomerBookings
          bookings={customerBookings}
          messages={bookingMessages}
          onBackToExplore={() => setView("explore")}
          onSubmitReview={async (booking, rating, comment) => {
            const studio = studios.find((candidate) => candidate.slug === booking.studioSlug);
            if (!studio) throw new Error("Studio was not found");
            const result = await submitBookingReview(booking, { rating, comment }, studio);
            setStudios((current) =>
              current.map((candidate) => (candidate.slug === result.studio.slug ? result.studio : candidate))
            );
            return result.studio;
          }}
          onOpenSaved={() => setView("saved")}
          onOpenHost={() => setView("host")}
          onSendMessage={(booking, body) => sendBookingMessage(booking, "guest", body)}
        />
        {supportLayer}
      </>
    );
  }

  if (view === "saved") {
    const savedStudios = studios.filter((studio) => saved.has(studio.slug));

    return (
      <>
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
        {supportLayer}
      </>
    );
  }

  if (view === "host") {
    return (
      <>
        <OwnerDashboard
          bookings={ownerBookings}
          messages={bookingMessages}
          onBackToExplore={() => setView("explore")}
          onOpenSaved={() => setView("saved")}
          onOpenBookings={() => setView("bookings")}
          initialTab={ownerInitialTab}
          studio={studios[0]}
          onDecideBooking={async (booking, decision) => {
            const updated = await decideOwnerBooking(booking, decision);
            setOwnerBookings((current) => current.map((item) => (item.id === updated.id ? updated : item)));
            setCustomerBookings((current) => current.map((item) => (item.id === updated.id ? updated : item)));
          }}
          onCompleteBooking={async (booking) => {
            const updated = await completeOwnerBooking(booking);
            setOwnerBookings((current) => current.map((item) => (item.id === updated.id ? updated : item)));
            setCustomerBookings((current) => current.map((item) => (item.id === updated.id ? updated : item)));
          }}
          onSendMessage={(booking, body) => sendBookingMessage(booking, "studio", body)}
          onBlockAvailability={createOwnerAvailabilityBlock}
          onReleaseAvailability={releaseOwnerAvailabilityBlock}
          onUpdateListing={async (studio, updates) => {
            const updated = await updateOwnerListing(studio, updates);
            setStudios((current) => current.map((item) => (item.slug === updated.slug ? updated : item)));
            return updated;
          }}
          session={session}
          onChangeSessionRole={changeSessionRole}
        />
        {supportLayer}
      </>
    );
  }

  if (view === "telegram-drafts") {
    return (
      <>
        <TelegramDraftInbox
          onBackToExplore={() => setView("explore")}
          onOpenEditor={() => {
            window.location.hash = "profile";
            setOwnerInitialTab("listing");
            setView("host");
          }}
        />
        {supportLayer}
      </>
    );
  }

  return (
    <>
      <main className="app-shell">
        <section className="hero-band">
        <div className="top-bar">
          <div>
            <p className="eyebrow">Prague launch</p>
            <h1>Find the right photo studio</h1>
          </div>
          <AccountSwitcher session={session} onChangeRole={changeSessionRole} />
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
      {supportLayer}
    </>
  );
};

interface AccountSwitcherProps {
  session: UserSession;
  onChangeRole: (role: UserRole) => Promise<void>;
}

const AccountSwitcher = ({ session, onChangeRole }: AccountSwitcherProps) => (
  <section className="account-switcher" aria-label="Prototype session">
    <div className="account-summary">
      <UserRound size={18} />
      <div>
        <strong>{session.displayName}</strong>
        <span>{roleLabels[session.role]}</span>
      </div>
    </div>
    <div className="role-toggle" role="group" aria-label="Session role">
      {roleOptions.map((role) => (
        <button
          className={session.role === role ? "active" : ""}
          key={role}
          onClick={() => onChangeRole(role)}
          type="button"
          aria-label={`Use ${roleLabels[role]} role`}
        >
          {roleLabels[role]}
        </button>
      ))}
    </div>
  </section>
);

interface OwnerOnboardingLayerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}

const OwnerOnboardingLayer = ({ isOpen, onClose, onOpen }: OwnerOnboardingLayerProps) => (
  <>
    <button className="owner-fab" onClick={onOpen} type="button">
      <Sparkles size={16} />
      List your studio
    </button>
    {isOpen && <OwnerOnboardingDrawer onClose={onClose} />}
  </>
);

const OwnerOnboardingDrawer = ({ onClose }: { onClose: () => void }) => {
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState<OwnerOnboardingDraft | undefined>();
  const [uploadedMedia, setUploadedMedia] = useState<OwnerMedia[]>([]);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailRequested, setEmailRequested] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [publishedListing, setPublishedListing] = useState<PublishedStudioListing | undefined>();
  const [status, setStatus] = useState("");

  const createDraft = async (event: FormEvent) => {
    event.preventDefault();
    const text = description.trim() || (files.length > 0 ? "Photos uploaded for review." : "");
    if (!text) {
      setStatus("Add a short description or at least one photo to create a draft.");
      return;
    }
    setStatus("Creating draft...");
    try {
      const nextDraft = await startOwnerOnboarding({ source: "web", text });
      const media = await Promise.all(
        files.map((file) =>
          uploadOwnerMedia({
            draftId: nextDraft.id,
            file,
            ownerSessionToken: nextDraft.ownerSessionToken
          })
        )
      );
      setDraft({ ...nextDraft, media: [...nextDraft.media, ...media] });
      setUploadedMedia(media);
      setStatus("Draft created. Review it below.");
    } catch {
      setStatus("Could not create the draft. Check the API and storage settings, then try again.");
    }
  };

  const requestCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !email.trim()) return;
    setStatus("Sending email code...");
    try {
      await requestOwnerEmailCode({ draftId: draft.id, email: email.trim() });
      setEmailRequested(true);
      setStatus("Email code sent.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send email code. Check the email sender settings and try again.");
    }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code) || !email.trim()) return;
    setStatus("Verifying email...");
    try {
      const session = await verifyOwnerEmailCode({ email: email.trim(), code });
      setEmailVerified(session.emailVerified);
      if (draft) setDraft({ ...draft, ownerSessionToken: session.ownerSessionToken });
      setStatus(session.emailVerified ? "Email verified." : "Email code was not verified.");
    } catch {
      setStatus("Could not verify email code. Check the 6-digit code and try again.");
    }
  };

  const publishDraft = async () => {
    if (!draft?.ownerSessionToken) {
      setStatus("Verify email before publishing this draft.");
      return;
    }
    setStatus("Publishing draft...");
    try {
      const listing = await publishOwnerDraft({ draftId: draft.id, ownerSessionToken: draft.ownerSessionToken });
      setPublishedListing(listing);
      setDraft({ ...draft, status: "published" });
      setStatus("Draft published.");
    } catch {
      setStatus("Could not publish draft. Verify email and complete any required account details.");
    }
  };

  return (
    <aside className="owner-drawer" role="dialog" aria-label="Create your studio profile">
      <div className="support-drawer-head owner-drawer-head">
        <div>
          <p className="eyebrow">Studio owners</p>
          <h2>Create your studio profile</h2>
        </div>
        <button className="icon-button" onClick={onClose} type="button" aria-label="Close owner onboarding">
          <X size={18} />
        </button>
      </div>

      <form className="owner-chat-form" onSubmit={createDraft}>
        <label>
          Studio description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Tell us the city, rooms, light, equipment, price, and house rules."
          />
        </label>
        <label>
          Add photos
          <input
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            onChange={(event: ChangeEvent<HTMLInputElement>) => setFiles(Array.from(event.target.files ?? []))}
            type="file"
          />
        </label>
        {files.length > 0 && (
          <div className="owner-photo-list">
            {files.map((file) => (
              <span key={`${file.name}-${file.size}`}>{file.name}</span>
            ))}
          </div>
        )}
        <button className="request-button" type="submit">
          Create draft
        </button>
      </form>

      {status && <p className="booking-status" role="status">{status}</p>}

      {draft && (
        <section className="owner-draft-preview" aria-label="Studio draft preview">
          <p className="eyebrow">Draft ready</p>
          <h3>{draft.studioName ?? "New studio draft"}</h3>
          {draft.city && <p>{draft.city}</p>}
          {draft.description && <p>{draft.description}</p>}
          <div className="owner-draft-tags">
            {draft.suggestedAmenities.map((amenity) => <span key={amenity}>{amenity}</span>)}
            {draft.missingFields.map((field) => <span key={field}>Review {field}</span>)}
          </div>
          {uploadedMedia.length > 0 && (
            <div className="owner-photo-list">
              {uploadedMedia.map((media) => <span key={media.id}>{media.fileName}</span>)}
            </div>
          )}
        </section>
      )}

      {draft && (
        <section className="owner-email-step">
          <p>Email helps you keep access to this draft from the web, even if you started in Telegram. No password.</p>
          <form className="owner-email-form" onSubmit={requestCode}>
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
            </label>
            <button className="request-button secondary" type="submit">
              Send code
            </button>
          </form>
          {emailRequested && (
            <form className="owner-email-form" onSubmit={verifyCode}>
              <label>
                6-digit code
                <input
                  inputMode="numeric"
                  maxLength={6}
                  pattern="\d{6}"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </label>
              <button className="request-button" disabled={code.length !== 6} type="submit">
                Verify email
              </button>
            </form>
          )}
          <button
            className="request-button"
            disabled={!emailVerified || draft.status === "published"}
            onClick={publishDraft}
            type="button"
          >
            {draft.status === "published" ? "Published" : "Publish draft"}
          </button>
          {publishedListing?.publicUrl && (
            <a className="request-button secondary owner-published-link" href={publishedListing.publicUrl}>
              Open published listing
            </a>
          )}
        </section>
      )}
    </aside>
  );
};

interface SupportLayerProps {
  events: SupportEvent[];
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  relatedStudioSlug?: string;
  screen: string;
}

const SupportLayer = ({ events, isOpen, onClose, onOpen, relatedStudioSlug, screen }: SupportLayerProps) => (
  <>
    <button className="support-fab" onClick={onOpen} type="button" aria-label="Open support">
      Help
    </button>
    {isOpen && (
      <SupportDrawer
        events={events}
        onClose={onClose}
        relatedStudioSlug={relatedStudioSlug}
        screen={screen}
      />
    )}
  </>
);

interface SupportDrawerProps {
  events: SupportEvent[];
  onClose: () => void;
  relatedStudioSlug?: string;
  screen: string;
}

const SupportDrawer = ({ events, onClose, relatedStudioSlug, screen }: SupportDrawerProps) => {
  const [message, setMessage] = useState("");
  const [includeActivity, setIncludeActivity] = useState(true);
  const [status, setStatus] = useState("");

  const submitSupportTicket = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    await createSupportTicket({
      message: trimmedMessage,
      includeActivity,
      screen,
      currentView: screen,
      currentStudioId: relatedStudioSlug,
      relatedStudioSlug,
      events: includeActivity ? events : [],
      sessionEvents: includeActivity ? events : [],
      userAgent: navigator.userAgent
    });
    setMessage("");
    setStatus("Support request sent.");
  };

  return (
    <aside className="support-drawer" aria-label="Support">
      <div className="support-drawer-head">
        <div>
          <p className="eyebrow">Support</p>
          <h2>Tell us what happened</h2>
        </div>
        <button className="icon-button" onClick={onClose} type="button" aria-label="Close support">
          <X size={18} />
        </button>
      </div>
      <form className="support-form" onSubmit={submitSupportTicket}>
        <label>
          Support message
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Describe the issue, idea, or confusing step."
            required
          />
        </label>
        <label className="support-consent">
          <input
            checked={includeActivity}
            onChange={(event) => setIncludeActivity(event.target.checked)}
            type="checkbox"
          />
          Include recent activity
        </label>
        <button className="request-button" type="submit">
          Send support request
        </button>
      </form>
      {status && <p className="booking-status">{status}</p>}
    </aside>
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
        <p className="review-count">{studio.reviewCount} reviews</p>
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
          <div className="detail-title-meta">
            <span className="status-pill">{listingStatusLabels[studio.listingStatus]}</span>
            <span className="rating large">
              <Star size={16} fill="currentColor" />
              {studio.rating}
            </span>
            <span className="review-count">{studio.reviewCount} reviews</span>
          </div>
        </div>

        <p className="description">{studio.description}</p>

        <div className="tag-row roomy">
          {studio.moodTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>

        <section className="detail-section" aria-label="Studio rooms">
          <h2>Rooms</h2>
          {studio.rooms.map((room) => {
            const roomImages = studio.images.filter(
              (image) => image.roomId === room.id || room.imageIds.includes(image.id)
            );

            return (
            <div className="room-card" key={room.id}>
              {roomImages.length > 0 && (
                <div className="room-media-strip">
                  {roomImages.slice(0, 3).map((image) => (
                    <img key={image.id} src={image.url} alt={image.alt} />
                  ))}
                </div>
              )}
              <div>
                <h3>{room.name}</h3>
                <p>{room.summary}</p>
                <span>{room.areaSqm} sqm · {room.ceilingHeightM} m ceiling · up to {room.capacity}</span>
              </div>
              <strong>{money(room.pricePerHour, studio.currency)}</strong>
            </div>
            );
          })}
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
          <h2>Props and access</h2>
          <div className="tag-row roomy">
            {studio.props.map((prop) => (
              <span key={prop}>{prop}</span>
            ))}
          </div>
          <p className="description">{studio.accessNotes}</p>
          <p className="description">{studio.cancellationPolicy}</p>
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
                ? "Booking confirmed. No online payment is taken; pay the studio directly."
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
  messages: Record<string, BookingMessage[]>;
  studio?: Studio;
  initialTab?: OwnerDashboardTab;
  onBackToExplore: () => void;
  onOpenSaved: () => void;
  onOpenBookings: () => void;
  onDecideBooking: (booking: BookingIntent, decision: "approve" | "decline") => Promise<void>;
  onCompleteBooking: (booking: BookingIntent) => Promise<void>;
  onSendMessage: (booking: BookingIntent, body: string) => void;
  onBlockAvailability: (block: Omit<OwnerAvailabilityBlock, "id">) => Promise<OwnerAvailabilityBlock>;
  onReleaseAvailability: (blockId: string) => Promise<void>;
  onUpdateListing: (studio: Studio, updates: OwnerListingUpdate) => Promise<Studio>;
  session: UserSession;
  onChangeSessionRole: (role: UserRole) => Promise<void>;
}

const statusLabel = (status: BookingIntent["status"]) => {
  const labels: Record<BookingIntent["status"], string> = {
    pending_owner_approval: "Needs review",
    awaiting_payment: "Confirmed - pay at studio",
    confirmed: "Confirmed",
    declined: "Declined",
    cancelled: "Cancelled",
    completed: "Completed"
  };

  return labels[status];
};

interface TelegramDraftInboxProps {
  onBackToExplore: () => void;
  onOpenEditor: () => void;
}

const TelegramDraftInbox = ({ onBackToExplore, onOpenEditor }: TelegramDraftInboxProps) => {
  const [drafts, setDrafts] = useState<ImportedListingDraft[]>([]);

  useEffect(() => {
    loadTelegramMiniAppDrafts().then(setDrafts);
  }, []);

  return (
    <main className="app-shell telegram-draft-shell">
      <section className="hero-band telegram-draft-hero">
        <div className="top-bar">
          <div>
            <p className="eyebrow">Telegram owner bot</p>
            <h1>Telegram studio drafts</h1>
          </div>
          <button aria-label="Back to explore" className="icon-button" onClick={onBackToExplore} type="button">
            <Search size={20} />
          </button>
        </div>
        <div className="owner-summary">
          <Sparkles size={20} />
          <div>
            <strong>Review imported drafts</strong>
            <span>Open a parsed studio draft in the owner editor, refine it, and publish from the web app.</span>
          </div>
        </div>
      </section>

      <section className="owner-list telegram-draft-list" aria-label="Telegram studio drafts">
        {drafts.length === 0 ? (
          <div className="empty-state">
            <h2>No Telegram drafts yet</h2>
            <p>Send studio notes to the Telegram bot, then come back here to review the parsed listing.</p>
          </div>
        ) : (
          drafts.map((draft) => (
            <article className="telegram-draft-card" key={draft.id}>
              <div>
                <p className="eyebrow">{draft.id}</p>
                <h2>{draft.draft.tagline}</h2>
              </div>
              <p>{draft.draft.description}</p>
              <div className="detected-filter-row" aria-label={`Detected filters for ${draft.id}`}>
                {draft.draft.shootTypes.map((shootType) => (
                  <span key={shootType}>{shootTypeLabels[shootType]}</span>
                ))}
                {draft.draft.featureIds.map((featureId) => (
                  <span key={featureId}>{featureLabels[featureId]}</span>
                ))}
              </div>
              <button className="payment-button" onClick={onOpenEditor} type="button">
                Open draft {draft.id} in editor
              </button>
            </article>
          ))
        )}
      </section>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <a href="#explore" onClick={onBackToExplore}>
          <Search size={19} />
          Explore
        </a>
        <a className="active" href="#telegram-drafts">
          <Sparkles size={19} />
          Drafts
        </a>
        <a href="#profile" onClick={onOpenEditor}>
          <Home size={19} />
          Host
        </a>
      </nav>
    </main>
  );
};

interface CustomerBookingsProps {
  bookings: BookingIntent[];
  messages: Record<string, BookingMessage[]>;
  onBackToExplore: () => void;
  onSubmitReview: (booking: BookingIntent, rating: number, comment: string) => Promise<Studio>;
  onOpenSaved: () => void;
  onOpenHost: () => void;
  onSendMessage: (booking: BookingIntent, body: string) => void;
}

const CustomerBookings = ({
  bookings,
  messages,
  onBackToExplore,
  onSubmitReview,
  onOpenSaved,
  onOpenHost,
  onSendMessage
}: CustomerBookingsProps) => {
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [reviewRatings, setReviewRatings] = useState<Record<string, number>>({});
  const [reviewedStudios, setReviewedStudios] = useState<Record<string, Studio>>({});

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
            <span>Track requests, approvals, and direct-at-studio payment notes.</span>
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
                <p className="booking-status">
                  No online payment is taken yet. Your request is approved; pay the studio directly according to the booking terms.
                </p>
              )}

              {(booking.status === "confirmed" || booking.status === "completed") && (
                <section className="booking-receipt" aria-label={`Booking summary for ${booking.studioName}`}>
                  <div>
                    <p className="eyebrow">Booking summary</p>
                    <h3>Booking #{booking.id}</h3>
                  </div>
                  <div className="receipt-lines">
                    <p>Price {accessibleMoney(booking.totalPrice, booking.currency)}</p>
                    <p>Payment: direct with the studio</p>
                    <p>
                      Shoot time: {booking.date} at {booking.startTime}
                    </p>
                  </div>
                </section>
              )}

              <section className="booking-thread" aria-label={`Messages for ${booking.studioName}`}>
                <div>
                  <p className="eyebrow">Messages</p>
                  <h3>Booking messages</h3>
                </div>
                {(messages[booking.id] ?? []).length > 0 ? (
                  <div className="message-list">
                    {(messages[booking.id] ?? []).map((message) => (
                      <p className={`message-bubble ${message.author}`} key={message.id}>
                        {message.authorLabel}: {message.body}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="owner-message">No messages yet.</p>
                )}
                <label>
                  Message studio about {booking.studioName}
                  <textarea
                    value={messageDrafts[booking.id] ?? ""}
                    onChange={(event) =>
                      setMessageDrafts((current) => ({ ...current, [booking.id]: event.target.value }))
                    }
                    placeholder="Ask about arrival, setup, props, or access"
                  />
                </label>
                <button
                  className="secondary-button"
                  onClick={() => {
                    onSendMessage(booking, messageDrafts[booking.id] ?? "");
                    setMessageDrafts((current) => ({ ...current, [booking.id]: "" }));
                  }}
                  type="button"
                >
                  Send message to {booking.studioName}
                </button>
              </section>

              {booking.status === "completed" && !reviewedStudios[booking.id] && (
                <form
                  className="booking-form listing-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const studio = await onSubmitReview(
                      booking,
                      reviewRatings[booking.id] ?? 5,
                      reviewComments[booking.id] ?? ""
                    );
                    setReviewedStudios((current) => ({
                      ...current,
                      [booking.id]: studio
                    }));
                  }}
                >
                  <label>
                    Review rating for {booking.studioName}
                    <select
                      value={reviewRatings[booking.id] ?? 5}
                      onChange={(event) =>
                        setReviewRatings((current) => ({
                          ...current,
                          [booking.id]: Number(event.target.value)
                        }))
                      }
                    >
                      {[5, 4, 3, 2, 1].map((rating) => (
                        <option key={rating} value={rating}>
                          {rating}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Review comment for {booking.studioName}
                    <textarea
                      value={reviewComments[booking.id] ?? ""}
                      onChange={(event) =>
                        setReviewComments((current) => ({
                          ...current,
                          [booking.id]: event.target.value
                        }))
                      }
                      placeholder="How was the studio for your shoot?"
                    />
                  </label>
                  <button className="request-button" type="submit">
                    Submit review for {booking.studioName}
                  </button>
                </form>
              )}

              {reviewedStudios[booking.id] && (
                <p className="booking-status">
                  Review posted: {booking.studioName} is now rated {reviewedStudios[booking.id].rating}.
                </p>
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
  messages,
  studio,
  initialTab = "requests",
  onBackToExplore,
  onOpenSaved,
  onOpenBookings,
  onDecideBooking,
  onCompleteBooking,
  onSendMessage,
  onBlockAvailability,
  onReleaseAvailability,
  onUpdateListing,
  session,
  onChangeSessionRole
}: OwnerDashboardProps) => {
  const [activeTab, setActiveTab] = useState<OwnerDashboardTab>(initialTab);
  const ownerTitle =
    activeTab === "requests"
      ? "Owner inbox"
      : activeTab === "calendar"
        ? "Calendar"
        : activeTab === "listing"
          ? "Manage listing"
          : activeTab === "support"
            ? "Support inbox"
            : "Launch readiness";
  const ownerSummary =
    activeTab === "requests"
      ? {
          icon: <Inbox size={20} />,
          title: `${bookings.length} requests`,
          text: "Review holds before payment collection."
        }
      : activeTab === "calendar"
        ? {
            icon: <CalendarDays size={20} />,
            title: "Availability controls",
            text: "Block maintenance, private shoots, and owner holds."
          }
        : activeTab === "listing"
          ? {
              icon: <Home size={20} />,
              title: studio?.name ?? "Studio listing",
              text: "Keep the public studio profile ready for photographers and clients."
            }
          : activeTab === "support"
            ? {
                icon: <Inbox size={20} />,
                title: "Product feedback",
                text: "Read user context and turn repeated friction into improvements."
              }
          : {
              icon: <Sparkles size={20} />,
              title: "Integrations setup",
              text: "Check AI, Telegram, public links, and payment keys before live testing."
            };

  return (
    <main className="app-shell owner-shell">
      <section className="hero-band owner-hero">
        <div className="top-bar">
          <div>
            <p className="eyebrow">Studio owners</p>
            <h1>{ownerTitle}</h1>
          </div>
          <button className="icon-button" aria-label="Back to explore" onClick={onBackToExplore}>
            <Search size={20} />
          </button>
        </div>
        <AccountSwitcher session={session} onChangeRole={onChangeSessionRole} />
        <div className="owner-summary">
          {ownerSummary.icon}
          <div>
            <strong>{ownerSummary.title}</strong>
            <span>{ownerSummary.text}</span>
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
          <button
            className={activeTab === "support" ? "active" : ""}
            onClick={() => setActiveTab("support")}
            type="button"
          >
            Support
          </button>
          <button
            className={activeTab === "launch" ? "active" : ""}
            onClick={() => setActiveTab("launch")}
            type="button"
          >
            Launch
          </button>
        </div>
      </section>

      {activeTab === "requests" ? (
        <OwnerRequests
          bookings={bookings}
          messages={messages}
          onCompleteBooking={onCompleteBooking}
          onDecideBooking={onDecideBooking}
          onSendMessage={onSendMessage}
        />
      ) : activeTab === "calendar" && studio ? (
        <OwnerCalendar
          studio={studio}
          onBlockAvailability={onBlockAvailability}
          onLoadAvailabilityBlocks={loadOwnerAvailabilityBlocks}
          onReleaseAvailability={onReleaseAvailability}
        />
      ) : activeTab === "support" ? (
        <SupportInbox />
      ) : activeTab === "launch" ? (
        <OwnerLaunchReadiness />
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

const SupportInbox = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  useEffect(() => {
    loadSupportTickets().then(setTickets);
  }, []);

  return (
    <section className="owner-list support-inbox" aria-label="Support inbox">
      <article className="support-inbox-hero">
        <div>
          <p className="eyebrow">Feedback loop</p>
          <h2>Support inbox</h2>
          <p>Use incoming context to spot confusing flows, missing data, and new feature requests.</p>
        </div>
        <span className="status-pill">{tickets.length} open</span>
      </article>

      {tickets.length === 0 ? (
        <div className="empty-state">
          <h2>No support tickets yet</h2>
          <p>New reports will include the screen, role, message, and recent activity when the user allows it.</p>
        </div>
      ) : (
        tickets.map((ticket) => (
          <article className="support-ticket-card" key={ticket.id}>
            <div className="owner-request-head">
              <div>
                <p className="eyebrow">{ticket.id}</p>
                <h2>{ticket.message}</h2>
              </div>
              <span className="status-pill">{ticket.category}</span>
            </div>
            <p>{ticket.session.displayName} - {roleLabels[ticket.session.role]}</p>
            <div className="support-ticket-meta">
              <span>{ticket.screen}</span>
              {ticket.relatedStudioSlug && <span>{ticket.relatedStudioSlug}</span>}
            </div>
            {ticket.events.length > 0 && (
              <div className="support-event-list" aria-label={`${ticket.id} recent activity`}>
                {ticket.events.slice(0, 4).map((event) => (
                  <span key={event.id}>{event.label}</span>
                ))}
              </div>
            )}
          </article>
        ))
      )}
    </section>
  );
};

const OwnerLaunchReadiness = () => {
  const [readiness, setReadiness] = useState<LaunchReadiness>();
  const [referralSummary, setReferralSummary] = useState<ReferralSummary>();
  const [listingReviews, setListingReviews] = useState<ListingReviewItem[]>([]);
  const [reviewStatus, setReviewStatus] = useState("");
  const [webhookStatus, setWebhookStatus] = useState<{
    state: "idle" | "loading" | "ready" | "error";
    message?: string;
    webhookUrl?: string;
  }>({
    state: "idle"
  });

  useEffect(() => {
    loadLaunchReadiness().then(setReadiness);
    loadReferralSummary().then(setReferralSummary);
    loadListingReviews().then(setListingReviews);
  }, []);

  const services = readiness
    ? [readiness.services.openai, readiness.services.telegram, readiness.services.publicAppUrl, readiness.services.stripe]
    : [];

  const handleTelegramWebhookSetup = async () => {
    setWebhookStatus({
      state: "loading",
      message: "Registering Telegram webhook..."
    });

    try {
      const result = await setupTelegramWebhook();
      setWebhookStatus({
        state: "ready",
        message: "Telegram webhook registered.",
        webhookUrl: result.webhookUrl
      });
    } catch (error) {
      setWebhookStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Telegram webhook setup failed."
      });
    }
  };

  return (
    <section className="owner-list launch-readiness" aria-label="Launch readiness">
      <article className="launch-readiness-hero">
        <div>
          <p className="eyebrow">Test setup</p>
          <h2>Launch readiness</h2>
          <p>
            Use this panel before a live test: it checks whether AI drafts, Telegram onboarding links, public web links,
            and payment keys are present without showing secret values.
          </p>
        </div>
        <span className="status-pill">{readiness?.envFile ?? ".env.local"}</span>
      </article>

      <div className="launch-service-grid">
        {services.map((service) => (
          <article className="launch-service-card" key={service.env}>
            <div>
              <h3>{service.label}</h3>
              <span className={`status-pill ${service.configured ? "confirmed" : "cancelled"}`}>
                {service.configured ? service.readyLabel : service.missingLabel}
              </span>
            </div>
            <p>{service.configured ? "Ready for the next integration step." : `Add ${service.env} in the env file.`}</p>
          </article>
        ))}
      </div>

      <article className="listing-status-panel">
        <div>
          <p className="eyebrow">Next test loop</p>
          <h2>Owner and buyer flows</h2>
          <p>
            The listing editor can already generate structured fields from text, save studio changes, submit the listing
            for review, and show the result in public search/detail pages.
          </p>
        </div>
        <div className="launch-next-steps">
          {(readiness?.nextSteps.length ? readiness.nextSteps : ["All local launch keys are configured."]).map((step) => (
            <span key={step}>
              <Check size={15} />
              {step}
            </span>
          ))}
        </div>
      </article>

      <article className="listing-status-panel">
        <div>
          <p className="eyebrow">Telegram bot</p>
          <h2>Owner import webhook</h2>
          <p>
            Register the bot webhook after filling TELEGRAM_BOT_TOKEN and PUBLIC_APP_URL. Telegram will send owner
            studio notes to the API, and imported drafts will appear in the listing editor.
          </p>
        </div>
        <div className="launch-next-steps">
          <button
            className="payment-button"
            disabled={webhookStatus.state === "loading"}
            onClick={handleTelegramWebhookSetup}
            type="button"
          >
            Setup Telegram webhook
          </button>
          {webhookStatus.message ? (
            <span className={webhookStatus.state === "error" ? "status-pill cancelled" : "status-pill confirmed"}>
              {webhookStatus.message}
            </span>
          ) : null}
          {webhookStatus.webhookUrl ? <code className="launch-webhook-url">{webhookStatus.webhookUrl}</code> : null}
        </div>
      </article>

      <OwnerReferralSummary summary={referralSummary} />
      <OwnerListingReviewQueue
        reviews={listingReviews}
        status={reviewStatus}
        onDecideReview={async (review, decision) => {
          const result = await decideListingReview(review.studioSlug, decision);
          setListingReviews((current) => current.filter((candidate) => candidate.studioSlug !== review.studioSlug));
          setReviewStatus(
            `${review.studioName} ${result.listingStatus === "published" ? "published" : "sent back to draft"}.`
          );
        }}
      />
    </section>
  );
};

const OwnerListingReviewQueue = ({
  onDecideReview,
  reviews,
  status
}: {
  onDecideReview: (review: ListingReviewItem, decision: ListingReviewDecision) => Promise<void>;
  reviews: ListingReviewItem[];
  status: string;
}) => (
  <article className="listing-status-panel listing-review-panel">
    <div>
      <p className="eyebrow">Admin review</p>
      <h2>Listing review queue</h2>
      <p>{reviews.length ? `${reviews.length} listings waiting for moderation.` : "No listings are waiting for review."}</p>
    </div>
    <div className="launch-next-steps">
      {reviews.map((review) => (
        <span key={review.studioSlug}>
          <Check size={15} />
          <strong>{review.studioName}</strong> {review.ownerName} - {review.district}
          <button
            className="inline-action"
            onClick={() => onDecideReview(review, "approve")}
            type="button"
            aria-label={`Approve ${review.studioName} listing`}
          >
            Approve
          </button>
        </span>
      ))}
      {status && <span>{status}</span>}
    </div>
  </article>
);

const OwnerReferralSummary = ({ summary }: { summary?: ReferralSummary }) => {
  const sources = (Object.entries(summary?.bySource ?? {}) as Array<[ReferralSource, number]>)
    .filter(([, count]) => count > 0)
    .sort(([, leftCount], [, rightCount]) => rightCount - leftCount);

  return (
    <article className="listing-status-panel referral-summary-panel">
      <div>
        <p className="eyebrow">Growth signals</p>
        <h2>Referral sources</h2>
        <p>{summary ? `${summary.total} visits tracked` : "Loading referral visits..."}</p>
      </div>
      <div className="launch-next-steps">
        {(sources.length ? sources : [["unknown", 0] as [ReferralSource, number]]).map(([source, count]) => (
          <span key={source}>
            <Check size={15} />
            {referralSourceLabels[source]} <strong>{count}</strong>
          </span>
        ))}
        {summary?.recent.slice(0, 3).map((referral) => (
          <span key={referral.id}>
            <Share2 size={15} />
            {referral.path}
          </span>
        ))}
      </div>
    </article>
  );
};

interface OwnerRequestsProps {
  bookings: BookingIntent[];
  messages: Record<string, BookingMessage[]>;
  onCompleteBooking: (booking: BookingIntent) => Promise<void>;
  onDecideBooking: (booking: BookingIntent, decision: "approve" | "decline") => Promise<void>;
  onSendMessage: (booking: BookingIntent, body: string) => void;
}

const OwnerRequests = ({ bookings, messages, onCompleteBooking, onDecideBooking, onSendMessage }: OwnerRequestsProps) => {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  return (
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

            <section className="booking-thread" aria-label={`Owner messages for ${booking.guestName}`}>
              <div>
                <p className="eyebrow">Messages</p>
                <h3>Booking messages</h3>
              </div>
              {(messages[booking.id] ?? []).length > 0 ? (
                <div className="message-list">
                  {(messages[booking.id] ?? []).map((message) => (
                    <p className={`message-bubble ${message.author}`} key={message.id}>
                      {message.authorLabel}: {message.body}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="owner-message">No messages yet.</p>
              )}
              <label>
                Reply to {booking.guestName} booking
                <textarea
                  value={replyDrafts[booking.id] ?? ""}
                  onChange={(event) =>
                    setReplyDrafts((current) => ({ ...current, [booking.id]: event.target.value }))
                  }
                  placeholder="Confirm arrival details or answer the client"
                />
              </label>
              <button
                className="secondary-button"
                onClick={() => {
                  onSendMessage(booking, replyDrafts[booking.id] ?? "");
                  setReplyDrafts((current) => ({ ...current, [booking.id]: "" }));
                }}
                type="button"
              >
                Send reply to {booking.guestName}
              </button>
            </section>

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

            {booking.status === "confirmed" && (
              <button
                className="approve-button"
                aria-label={`Complete ${booking.guestName} booking`}
                onClick={() => onCompleteBooking(booking)}
              >
                <Check size={17} />
                Complete booking
              </button>
            )}
          </article>
        ))
      )}
    </section>
  );
};

interface OwnerCalendarProps {
  studio: Studio;
  onBlockAvailability: (block: Omit<OwnerAvailabilityBlock, "id">) => Promise<OwnerAvailabilityBlock>;
  onLoadAvailabilityBlocks: (studioSlug?: string) => Promise<OwnerAvailabilityBlock[]>;
  onReleaseAvailability: (blockId: string) => Promise<void>;
}

const OwnerCalendar = ({
  studio,
  onBlockAvailability,
  onLoadAvailabilityBlocks,
  onReleaseAvailability
}: OwnerCalendarProps) => {
  const [roomId, setRoomId] = useState(studio.rooms[0]?.id ?? "");
  const [date, setDate] = useState("2026-06-12");
  const [startTime, setStartTime] = useState("09:00");
  const [calendarAction, setCalendarAction] = useState<"hold" | "open">("hold");
  const [isFullDay, setIsFullDay] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [reason, setReason] = useState("");
  const [blocks, setBlocks] = useState<OwnerAvailabilityBlock[]>([]);
  const [agendaRoom, setAgendaRoom] = useState("all");
  const [agendaAction, setAgendaAction] = useState<"all" | "hold" | "open">("all");
  const selectedRoom = studio.rooms.find((room) => room.id === roomId) ?? studio.rooms[0];
  const holdCount = blocks.filter((block) => (block.kind ?? "hold") === "hold").length;
  const openOverrideCount = blocks.filter((block) => block.kind === "open").length;
  const fullDayCount = blocks.filter((block) => (block.kind ?? "hold") === "hold" && block.startTime === "full-day").length;
  const nextCalendarDate = blocks
    .map((block) => block.date)
    .sort((firstDate, secondDate) => firstDate.localeCompare(secondDate))[0];
  const visibleAgendaBlocks = useMemo(
    () =>
      blocks.filter((block) => {
        const matchesRoom = agendaRoom === "all" || block.roomId === agendaRoom;
        const blockAction = block.kind === "open" ? "open" : "hold";
        const matchesAction = agendaAction === "all" || blockAction === agendaAction;
        return matchesRoom && matchesAction;
      }),
    [agendaAction, agendaRoom, blocks]
  );
  const agendaGroups = useMemo(
    () =>
      Array.from(
        visibleAgendaBlocks
          .slice()
          .sort((firstBlock, secondBlock) =>
            `${firstBlock.date}-${firstBlock.startTime}`.localeCompare(`${secondBlock.date}-${secondBlock.startTime}`)
          )
          .reduce((groups, block) => {
            const group = groups.get(block.date) ?? [];
            group.push(block);
            groups.set(block.date, group);
            return groups;
          }, new Map<string, OwnerAvailabilityBlock[]>())
      ),
    [visibleAgendaBlocks]
  );

  useEffect(() => {
    onLoadAvailabilityBlocks(studio.slug).then(setBlocks);
  }, [onLoadAvailabilityBlocks, studio.slug]);

  const blockSlot = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedRoom) return;

    const nextBlocks = await Promise.all(
      Array.from({ length: repeatWeeks }, (_, index) =>
        onBlockAvailability({
          studioSlug: studio.slug,
          roomId: selectedRoom.id,
          date: addDays(date, index * 7),
          startTime: calendarAction === "hold" && isFullDay ? "full-day" : startTime,
          kind: calendarAction,
          reason: reason.trim() || (calendarAction === "open" ? "Availability override" : "Owner hold")
        })
      )
    );
    setBlocks((current) => [...nextBlocks.reverse(), ...current]);
    setReason("");
  };

  const releaseBlock = async (block: OwnerAvailabilityBlock) => {
    await onReleaseAvailability(block.id);
    setBlocks((current) => current.filter((currentBlock) => currentBlock.id !== block.id));
  };

  const duplicateNextWeek = async (block: OwnerAvailabilityBlock) => {
    const duplicated = await onBlockAvailability({
      studioSlug: block.studioSlug,
      roomId: block.roomId,
      date: addDays(block.date, 7),
      startTime: block.startTime,
      kind: block.kind ?? "hold",
      reason: block.reason
    });
    setBlocks((current) => [duplicated, ...current]);
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
          Calendar action
          <select
            value={calendarAction}
            onChange={(event) => {
              const nextAction = event.target.value as "hold" | "open";
              setCalendarAction(nextAction);
              if (nextAction === "open") {
                setIsFullDay(false);
                setRepeatWeeks(1);
              }
            }}
          >
            <option value="hold">Hold or closure</option>
            <option value="open">Open extra availability</option>
          </select>
        </label>
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
          <select
            disabled={calendarAction === "hold" && isFullDay}
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          >
            {["09:00", "11:00", "13:00", "15:00"].map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-row">
          <input
            checked={calendarAction === "hold" && isFullDay}
            disabled={calendarAction === "open"}
            onChange={(event) => setIsFullDay(event.target.checked)}
            type="checkbox"
          />
          Full-day closure
        </label>
        <label>
          Repeat
          <select
            disabled={calendarAction === "open"}
            value={repeatWeeks}
            onChange={(event) => setRepeatWeeks(Number(event.target.value))}
          >
            <option value={1}>Does not repeat</option>
            <option value={2}>Weekly for 2 weeks</option>
            <option value={4}>Weekly for 4 weeks</option>
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

      <section className="calendar-summary-panel" aria-label="Calendar summary">
        <div>
          <p className="eyebrow">Owner agenda</p>
          <h2>Calendar summary</h2>
        </div>
        <div className="calendar-summary-grid">
          <span>{holdCount} {holdCount === 1 ? "hold" : "holds"}</span>
          <span>{openOverrideCount} open {openOverrideCount === 1 ? "override" : "overrides"}</span>
          <span>{fullDayCount} full-day {fullDayCount === 1 ? "closure" : "closures"}</span>
          <span>{nextCalendarDate ?? "No upcoming changes"}</span>
        </div>
      </section>

      <section className="calendar-agenda-panel" aria-label="Calendar agenda">
        <div>
          <p className="eyebrow">By day</p>
          <h2>Calendar agenda</h2>
        </div>
        <div className="calendar-agenda-filters">
          <label>
            Agenda room
            <select value={agendaRoom} onChange={(event) => setAgendaRoom(event.target.value)}>
              <option value="all">All rooms</option>
              {studio.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Agenda action
            <select
              value={agendaAction}
              onChange={(event) => setAgendaAction(event.target.value as "all" | "hold" | "open")}
            >
              <option value="all">All actions</option>
              <option value="hold">Holds only</option>
              <option value="open">Open overrides</option>
            </select>
          </label>
        </div>
        {agendaGroups.length === 0 ? (
          <p className="empty-state">No calendar changes yet.</p>
        ) : (
          agendaGroups.map(([agendaDate, agendaBlocks]) => (
            <article className="calendar-agenda-day" key={agendaDate}>
              <h3>
                {agendaDate} - {agendaBlocks.length} {agendaBlocks.length === 1 ? "change" : "changes"}
              </h3>
              {agendaBlocks.map((block) => {
                const room = studio.rooms.find((candidate) => candidate.id === block.roomId);
                const blockLabel = block.startTime === "full-day" ? "Full day" : block.startTime;
                const actionLabel = block.kind === "open" ? "Open" : "Hold";
                return (
                  <div className="calendar-agenda-row" key={block.id}>
                    <span>
                      {room?.name ?? "Room"} - {blockLabel} - {actionLabel}
                    </span>
                    <button
                      aria-label={`Duplicate ${blockLabel} ${room?.name ?? "Room"} change to next week`}
                      className="secondary-button"
                      onClick={() => duplicateNextWeek(block)}
                      type="button"
                    >
                      Next week
                    </button>
                  </div>
                );
              })}
            </article>
          ))
        )}
      </section>

      {blocks.map((block) => {
        const room = studio.rooms.find((candidate) => candidate.id === block.roomId);
        const blockLabel = block.startTime === "full-day" ? "Full day" : block.startTime;
        const isOpenOverride = block.kind === "open";
        return (
          <article className="owner-request" key={block.id}>
            <div className="owner-request-head">
              <div>
                <p className="eyebrow">{block.date}</p>
                <h2>
                  {blockLabel} {room?.name ?? "Room"} {isOpenOverride ? "opened" : "blocked"}.
                </h2>
              </div>
              <span className="status-pill">{isOpenOverride ? "Open" : "Blocked"}</span>
            </div>
            <p className="owner-message">{block.reason}</p>
            <button
              aria-label={`Release ${blockLabel} ${room?.name ?? "Room"} ${isOpenOverride ? "override" : "block"}`}
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

const filenameCaption = (fileName: string) => fileName.replace(/\.[^.]+$/, "");

const readMediaFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });

const OwnerListingEditor = ({ studio, onUpdateListing }: OwnerListingEditorProps) => {
  const [aiDraft, setAiDraft] = useState("");
  const [aiDraftStatus, setAiDraftStatus] = useState("");
  const [importedDrafts, setImportedDrafts] = useState<ImportedListingDraft[]>([]);
  const [tagline, setTagline] = useState(studio.tagline);
  const [description, setDescription] = useState(studio.description);
  const [priceFrom, setPriceFrom] = useState(String(studio.priceFrom));
  const [bookingMode, setBookingMode] = useState<BookingMode>(studio.bookingMode);
  const [shootTypes, setShootTypes] = useState<ShootType[]>(studio.shootTypes);
  const [featureIds, setFeatureIds] = useState<FeatureId[]>(studio.featureIds);
  const [equipmentIds, setEquipmentIds] = useState<EquipmentId[]>(studio.equipmentIds);
  const [amenityIds, setAmenityIds] = useState<AmenityId[]>(studio.amenityIds);
  const [images, setImages] = useState<StudioImage[]>(studio.images);
  const [rooms, setRooms] = useState<StudioRoom[]>(studio.rooms);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [mediaKind, setMediaKind] = useState<StudioImage["kind"]>("room");
  const [mediaRoomId, setMediaRoomId] = useState(studio.rooms[0]?.id ?? "");
  const [mediaSuggestion, setMediaSuggestion] = useState("");
  const [props, setProps] = useState(studio.props.join("\n"));
  const [accessNotes, setAccessNotes] = useState(studio.accessNotes);
  const [cancellationPolicy, setCancellationPolicy] = useState(studio.cancellationPolicy);
  const [rules, setRules] = useState(studio.rules.join("\n"));
  const [saved, setSaved] = useState(false);
  const [submittedForReview, setSubmittedForReview] = useState(false);
  const previewHero = images.find((image) => image.kind === "hero") ?? images[0];

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
    setRooms(studio.rooms);
    setMediaRoomId(studio.rooms[0]?.id ?? "");
    setMediaSuggestion("");
    setProps(studio.props.join("\n"));
    setAccessNotes(studio.accessNotes);
    setCancellationPolicy(studio.cancellationPolicy);
    setRules(studio.rules.join("\n"));
  }, [studio]);

  useEffect(() => {
    loadOwnerListingDrafts().then(setImportedDrafts);
  }, []);

  const applyDraft = (draft: ListingDraft) => {
    setTagline(draft.tagline);
    setDescription(draft.description);
    if (draft.shootTypes.length) setShootTypes(draft.shootTypes);
    if (draft.featureIds.length) setFeatureIds(draft.featureIds);
    if (draft.equipmentIds.length) setEquipmentIds(draft.equipmentIds);
    if (draft.amenityIds.length) setAmenityIds(draft.amenityIds);
    if (draft.rules.length) setRules(draft.rules.join("\n"));
  };

  const generateDraft = async () => {
    const { draft, mode } = await generateListingDraft(aiDraft);
    applyDraft(draft);
    setAiDraftStatus(
      mode === "local-fallback"
        ? "Draft generated with local fallback. Add OPENAI_API_KEY to use live AI."
        : "Draft generated through the AI endpoint."
    );
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

  const updateRoom = (
    roomId: string,
    updates: Partial<
      Pick<StudioRoom, "summary" | "pricePerHour" | "bookingMode" | "areaSqm" | "ceilingHeightM" | "capacity">
    >
  ) => {
    setRooms((current) => current.map((room) => (room.id === roomId ? { ...room, ...updates } : room)));
  };

  const handleMediaFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const dataUrl = await readMediaFile(file);
    setMediaUrl(dataUrl);
    if (!mediaCaption.trim()) setMediaCaption(filenameCaption(file.name));
    setMediaSuggestion(`Uploaded ${file.name}.`);
  };

  const suggestMediaDetailsLocally = () => {
    const note = `${mediaCaption} ${mediaUrl}`.toLowerCase();
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
      setMediaKind("room");
      setMediaRoomId(matchingRoom.id);
      setMediaSuggestion(`AI suggestion: room media for ${matchingRoom.name}.`);
      return;
    }

    if (/hero|cover|main photo|opening/.test(note)) {
      setMediaKind("hero");
      setMediaRoomId("");
      setMediaSuggestion("AI suggestion: hero media for the listing cover.");
      return;
    }

    if (/equipment|softbox|strobe|stand|c-stand|prop|backdrop/.test(note)) {
      setMediaKind("equipment");
      setMediaRoomId("");
      setMediaSuggestion("AI suggestion: equipment and props media.");
      return;
    }

    if (/example|shoot|portrait|fashion|editorial|campaign|lookbook/.test(note)) {
      setMediaKind("example");
      setMediaRoomId("");
      setMediaSuggestion("AI suggestion: example shoot media for client inspiration.");
      return;
    }

    setMediaKind("room");
    setMediaRoomId(rooms[0]?.id ?? "");
    setMediaSuggestion("AI suggestion: room media. Review the room before saving.");
  };

  const applyMediaSuggestion = (suggestion: MediaSuggestionResult["suggestion"]) => {
    setMediaKind(suggestion.kind);
    const matchingRoom = suggestion.roomId ? rooms.find((room) => room.id === suggestion.roomId) : undefined;
    setMediaRoomId(suggestion.kind === "room" ? matchingRoom?.id ?? rooms[0]?.id ?? "" : "");
    const suggestionLabel =
      suggestion.kind === "room" && matchingRoom
        ? `room media for ${matchingRoom.name}`
        : mediaKindLabels[suggestion.kind];
    setMediaSuggestion(`AI suggestion: ${suggestionLabel}. ${suggestion.reason}`);
  };

  const suggestMediaDetails = async () => {
    setMediaSuggestion("Analyzing media...");

    try {
      const result = await suggestMediaDetailsFromApi(
        mediaCaption,
        mediaUrl,
        rooms.map(({ id, name }) => ({ id, name }))
      );
      applyMediaSuggestion(result.suggestion);
    } catch {
      suggestMediaDetailsLocally();
    }
  };

  const addMedia = () => {
    const trimmedUrl = mediaUrl.trim();
    const trimmedCaption = mediaCaption.trim();
    if (!trimmedUrl || !trimmedCaption) return;
    const imageId = `owner-media-${Date.now()}`;
    const assignedRoomId = mediaKind === "room" && mediaRoomId ? mediaRoomId : undefined;

    setImages((current) => [
      ...current,
      {
        id: imageId,
        url: trimmedUrl,
        alt: trimmedCaption,
        kind: mediaKind,
        roomId: assignedRoomId
      }
    ]);
    if (assignedRoomId) {
      setRooms((current) =>
        current.map((room) =>
          room.id === assignedRoomId ? { ...room, imageIds: [...room.imageIds, imageId] } : room
        )
      );
    }
    setMediaUrl("");
    setMediaCaption("");
    setMediaKind("room");
    setMediaRoomId(rooms[0]?.id ?? "");
    setMediaSuggestion("");
  };

  const moveMedia = (imageId: string, direction: "up" | "down") => {
    setImages((current) => {
      const index = current.findIndex((image) => image.id === imageId);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current;

      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const setHeroMedia = (imageId: string) => {
    setImages((current) =>
      current.map((image) => ({
        ...image,
        kind: image.id === imageId ? "hero" : image.kind === "hero" ? "room" : image.kind
      }))
    );
  };

  const submitListing = async (event: FormEvent) => {
    event.preventDefault();
    const updatedRules = rules
      .split("\n")
      .map((rule) => rule.trim())
      .filter(Boolean);
    const updatedProps = props
      .split("\n")
      .map((prop) => prop.trim())
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
      rooms,
      props: updatedProps,
      accessNotes,
      cancellationPolicy,
      rules: updatedRules
    });
    setSaved(true);
  };

  const submitForReview = async () => {
    await onUpdateListing(studio, {
      listingStatus: "in_review"
    });
    setSaved(false);
    setSubmittedForReview(true);
  };

  return (
    <section className="owner-list listing-editor" aria-label="Owner listing editor">
      <article className="listing-preview" aria-label="Listing preview">
        {previewHero && <img src={previewHero.url} alt={previewHero.alt} />}
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

      <article className="listing-status-panel">
        <div>
          <p className="eyebrow">Moderation status</p>
          <h2>{listingStatusLabels[studio.listingStatus]}</h2>
          <p>
            {studio.listingStatus === "draft"
              ? "Keep editing, then send the profile for marketplace review."
              : studio.listingStatus === "in_review"
                ? "The profile is queued for admin review before publishing."
                : "The profile is visible in marketplace search and detail pages."}
          </p>
        </div>
        <button
          className="secondary-button"
          disabled={studio.listingStatus === "in_review"}
          onClick={submitForReview}
          type="button"
        >
          Submit listing for review
        </button>
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
        {aiDraftStatus && <p className="booking-status">{aiDraftStatus}</p>}
      </article>

      {importedDrafts.length > 0 && (
        <article className="imported-drafts-panel" aria-label="Imported owner drafts">
          <div>
            <p className="eyebrow">Telegram imports</p>
            <h2>Imported owner drafts</h2>
            <p>Review drafts that came from the Telegram onboarding bot, then apply one to the listing form.</p>
          </div>
          {importedDrafts.map((importedDraft) => (
            <div className="imported-draft-card" key={importedDraft.id}>
              <div>
                <strong>{importedDraft.draft.tagline}</strong>
                <span>{importedDraft.mode === "openai" ? "OpenAI draft" : "Local fallback draft"}</span>
              </div>
              <button
                className="secondary-button"
                onClick={() => {
                  applyDraft(importedDraft.draft);
                  setAiDraftStatus(`Imported ${importedDraft.id} from Telegram.`);
                }}
                type="button"
              >
                Use Telegram draft {importedDraft.id}
              </button>
            </div>
          ))}
        </article>
      )}

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
        <section className="room-editor" aria-label="Room pricing editor">
          <h2>Rooms and pricing</h2>
          <div className="room-editor-grid">
            {rooms.map((room) => (
              <article className="room-editor-card" key={room.id}>
                <div>
                  <p className="eyebrow">
                    {room.areaSqm} sqm - {room.ceilingHeightM} m ceiling - up to {room.capacity}
                  </p>
                  <h3>{room.name}</h3>
                  <strong>{money(room.pricePerHour, studio.currency)} / hour</strong>
                </div>
                <label>
                  {room.name} summary
                  <textarea
                    value={room.summary}
                    onChange={(event) => updateRoom(room.id, { summary: event.target.value })}
                    required
                  />
                </label>
                <label>
                  {room.name} hourly price
                  <input
                    min="1"
                    type="number"
                    value={room.pricePerHour}
                    onChange={(event) => updateRoom(room.id, { pricePerHour: Number(event.target.value) })}
                    required
                  />
                </label>
                <div className="room-attribute-grid">
                  <label>
                    {room.name} area
                    <input
                      min="1"
                      type="number"
                      value={room.areaSqm}
                      onChange={(event) => updateRoom(room.id, { areaSqm: Number(event.target.value) })}
                      required
                    />
                  </label>
                  <label>
                    {room.name} ceiling height
                    <input
                      min="1"
                      step="0.1"
                      type="number"
                      value={room.ceilingHeightM}
                      onChange={(event) => updateRoom(room.id, { ceilingHeightM: Number(event.target.value) })}
                      required
                    />
                  </label>
                  <label>
                    {room.name} capacity
                    <input
                      min="1"
                      type="number"
                      value={room.capacity}
                      onChange={(event) => updateRoom(room.id, { capacity: Number(event.target.value) })}
                      required
                    />
                  </label>
                </div>
                <label>
                  {room.name} booking mode
                  <select
                    value={room.bookingMode}
                    onChange={(event) => updateRoom(room.id, { bookingMode: event.target.value as BookingMode })}
                  >
                    <option value="hybrid">Hybrid</option>
                    <option value="request">Request</option>
                    <option value="instant">Instant</option>
                  </select>
                </label>
              </article>
            ))}
          </div>
        </section>
        <section className="media-editor" aria-label="Studio media library">
          <h2>Studio media</h2>
          <div className="media-grid">
            {images.map((image, index) => (
              <MediaCard
                image={image}
                isFirst={index === 0}
                isLast={index === images.length - 1}
                key={image.id}
                onMoveDown={() => moveMedia(image.id, "down")}
                onMoveUp={() => moveMedia(image.id, "up")}
                onSetHero={() => setHeroMedia(image.id)}
                position={index + 1}
                rooms={rooms}
              />
            ))}
          </div>
          <div className="media-form">
            <label>
              Media file
              <input accept="image/*" onChange={handleMediaFileUpload} type="file" />
            </label>
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
              <select
                value={mediaKind}
                onChange={(event) => {
                  const nextKind = event.target.value as StudioImage["kind"];
                  setMediaKind(nextKind);
                  if (nextKind !== "room") setMediaRoomId("");
                  if (nextKind === "room" && !mediaRoomId) setMediaRoomId(rooms[0]?.id ?? "");
                }}
              >
                <option value="hero">Hero</option>
                <option value="room">Rooms</option>
                <option value="example">Example shoots</option>
                <option value="equipment">Equipment and props</option>
              </select>
            </label>
            <label>
              Media room
              <select
                disabled={mediaKind !== "room"}
                value={mediaKind === "room" ? mediaRoomId : ""}
                onChange={(event) => setMediaRoomId(event.target.value)}
              >
                <option value="">No room</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary-button" onClick={suggestMediaDetails} type="button">
              Suggest media details
            </button>
            {mediaSuggestion ? <p className="media-suggestion">{mediaSuggestion}</p> : null}
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
        <section className="listing-operations" aria-label="Listing logistics">
          <h2>Props and logistics</h2>
          <label>
            Props
            <textarea value={props} onChange={(event) => setProps(event.target.value)} required />
          </label>
          <label>
            Access notes
            <textarea value={accessNotes} onChange={(event) => setAccessNotes(event.target.value)} required />
          </label>
          <label>
            Cancellation policy
            <textarea
              value={cancellationPolicy}
              onChange={(event) => setCancellationPolicy(event.target.value)}
              required
            />
          </label>
          <div className="listing-logistics-preview">
            <div className="tag-row roomy">
              {props
                .split("\n")
                .map((prop) => prop.trim())
                .filter(Boolean)
                .map((prop) => (
                  <span key={prop}>{prop}</span>
                ))}
            </div>
            <p>{accessNotes}</p>
            <p>{cancellationPolicy}</p>
          </div>
        </section>
        <button className="request-button" type="submit">
          Save listing changes
        </button>
      </form>

      {saved && <p className="booking-status">Listing updated.</p>}
      {submittedForReview && <p className="booking-status">Listing submitted for review.</p>}
    </section>
  );
};

interface MediaCardProps {
  image: StudioImage;
  isFirst: boolean;
  isLast: boolean;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onSetHero: () => void;
  position: number;
  rooms: StudioRoom[];
}

const MediaCard = ({ image, isFirst, isLast, onMoveDown, onMoveUp, onSetHero, position, rooms }: MediaCardProps) => {
  const assignedRoom = rooms.find((room) => room.id === image.roomId || room.imageIds.includes(image.id));

  return (
    <article className="media-card">
      <img src={image.url} alt={image.alt} />
      <div>
        <div className="media-meta-row">
          <span>{mediaKindLabels[image.kind]}</span>
          <span>Position {position}</span>
          {assignedRoom ? <span className="media-room-label">{assignedRoom.name}</span> : null}
        </div>
        <p>{image.alt}</p>
        <div className="media-actions">
          <button
            aria-label={`Move ${image.alt} media up`}
            disabled={isFirst}
            onClick={onMoveUp}
            type="button"
          >
            Up
          </button>
          <button
            aria-label={`Move ${image.alt} media down`}
            disabled={isLast}
            onClick={onMoveDown}
            type="button"
          >
            Down
          </button>
          <button
            aria-label={`Set ${image.alt} as hero media`}
            disabled={image.kind === "hero"}
            onClick={onSetHero}
            type="button"
          >
            Hero
          </button>
        </div>
      </div>
    </article>
  );
};
