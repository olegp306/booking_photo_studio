import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import {
  applyStudioReview,
  createBookingIntent,
  decideBookingIntent,
  findStudioBySlug,
  getAvailabilityForStudio,
  markBookingCompleted,
  markBookingPaid,
  searchStudios,
  seedStudios,
  taxonomy,
  type AmenityId,
  type AvailabilitySlot,
  type BookingMode,
  type BookingIntent,
  type BookingIntentRequest,
  type EquipmentId,
  type FeatureId,
  type ListingReviewDecision,
  type ListingReviewItem,
  type OwnerListingUpdate,
  type OwnerBookingDecision,
  type OwnerAvailabilityBlock,
  type PublicApiMetric,
  type SharedShortlist,
  type SharedShortlistItem,
  type ReferralRecord,
  type ReferralSource,
  type ReferralSourceTotals,
  type ShootType,
  type Studio,
  type SupportCategory,
  type SupportEvent,
  type SupportPriority,
  type SupportTicket,
  type SupportUserRole,
  type StudioReview,
  type StudioReviewRequest,
  type StudioSearchFilters,
  type UserRole,
  type UserSession
} from "@studio-market/shared";
import { generateListingDraft, type FetchLike } from "./aiListing";
import { suggestMediaDetails } from "./aiMedia";
import { getLaunchReadiness, getProductionOnboardingReadiness, loadRuntimeConfig, type RuntimeConfig } from "./env";
import { createJsonResourceStore } from "./jsonResourceStore";
import { createListingDraftStore } from "./listingDraftStore";
import {
  createOwnerSessionToken,
  createOtpExpiry,
  createSixDigitCode,
  hashOtpCode,
  normalizeEmail,
  parseOwnerSessionToken,
  verifyOtpCode
} from "./auth";
import { createEmailService, createResendEmailService, type EmailService } from "./email";
import {
  createInMemoryOwnerRepository,
  createPrismaOwnerRepository,
  type OwnerRepository,
  type OwnerSession as OwnerRepositorySession
} from "./ownerRepository";
import { createPrismaClient } from "./db";
import { createOwnerOnboardingService, ownerDraftPublishing } from "./ownerOnboarding";
import { getPaymentInstructions, getPaymentMode, type PaymentMode } from "./paymentMode";
import { createR2StorageService, createStorageService, type StorageService } from "./storage";
import {
  extractTelegramChatId,
  extractTelegramText,
  createTelegramBotHandler,
  isTelegramSecretValid,
  registerTelegramListingDraftWebhook,
  sendTelegramListingDraftReply,
  type TelegramOwnerServices,
} from "./telegram";

const toArray = <T extends string>(value: string | string[] | undefined): T[] | undefined => {
  if (!value) return undefined;
  const values = Array.isArray(value) ? value : value.split(",");
  return values.map((item) => item.trim()).filter(Boolean) as T[];
};

const supportedSessionRoles: UserRole[] = ["client", "photographer", "studio_owner", "admin"];
const defaultSession: UserSession = {
  id: "demo-session",
  role: "photographer",
  displayName: "Marta Photographer"
};

const isUserRole = (role: unknown): role is UserRole =>
  typeof role === "string" && supportedSessionRoles.includes(role as UserRole);

const supportCategories: SupportCategory[] = [
  "booking_issue",
  "studio_info_wrong",
  "payment",
  "owner_listing",
  "idea",
  "bug",
  "feature_request",
  "bug_report",
  "listing_quality",
  "owner_onboarding",
  "other"
];

const isSupportCategory = (category: unknown): category is SupportCategory =>
  typeof category === "string" && supportCategories.includes(category as SupportCategory);

const supportPriorities: SupportPriority[] = ["low", "medium", "high"];
const isSupportPriority = (priority: unknown): priority is SupportPriority =>
  typeof priority === "string" && supportPriorities.includes(priority as SupportPriority);

const supportUserRoles: SupportUserRole[] = ["client", "photographer", "studio_owner", "admin", "owner", "unknown"];
const isSupportUserRole = (role: unknown): role is SupportUserRole =>
  typeof role === "string" && supportUserRoles.includes(role as SupportUserRole);

const referralSources: ReferralSource[] = ["telegram", "photographer", "studio_owner", "direct", "unknown"];
const isReferralSource = (source: unknown): source is ReferralSource =>
  typeof source === "string" && referralSources.includes(source as ReferralSource);

const referralSourceLabels = Object.fromEntries(referralSources.map((source) => [source, 0])) as ReferralSourceTotals;

const triageSupportTicket = (message: string): { category: SupportCategory; priority: SupportPriority; triageReason: string } => {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("owner") ||
    normalized.includes("studio profile") ||
    normalized.includes("draft") ||
    normalized.includes("email code") ||
    normalized.includes("photo upload")
  ) {
    return {
      category: "owner_onboarding",
      priority: normalized.includes("broken") || normalized.includes("failed") || normalized.includes("error") ? "high" : "medium",
      triageReason: "Matched owner onboarding or draft creation words in the support message."
    };
  }
  if (normalized.includes("payment") || normalized.includes("paid") || normalized.includes("stripe")) {
    return {
      category: "payment",
      priority: "medium",
      triageReason: "Matched payment-related words in the support message."
    };
  }
  if (normalized.includes("bug") || normalized.includes("broken") || normalized.includes("error")) {
    return {
      category: "bug_report",
      priority: "high",
      triageReason: "Matched bug or error words in the support message."
    };
  }
  if (normalized.includes("wrong") || normalized.includes("address") || normalized.includes("photo") || normalized.includes("listing")) {
    return {
      category: "listing_quality",
      priority: "medium",
      triageReason: "Matched studio information correction words in the support message."
    };
  }
  if (normalized.includes("booking") || normalized.includes("slot") || normalized.includes("confirmed")) {
    return {
      category: "booking_issue",
      priority: "medium",
      triageReason: "Matched booking or slot words in the support message."
    };
  }
  if (normalized.includes("feature") || normalized.includes("add") || normalized.includes("idea")) {
    return {
      category: "feature_request",
      priority: "low",
      triageReason: "Matched product feedback words in the support message."
    };
  }

  return {
    category: "other",
    priority: "low",
    triageReason: "No operational issue keywords matched, so this is kept for manual review."
  };
};

interface BuildServerOptions {
  config?: Partial<RuntimeConfig>;
  fetch?: FetchLike;
  services?: Partial<OwnerServices>;
}

interface OwnerServices {
  createOtpCode: () => string;
  email: EmailService;
  ownerRepository: OwnerRepository;
  storage: StorageService;
  telegramOwner: TelegramOwnerServices;
}

interface EmailOtpChallengeRecord {
  id: string;
  userId: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt?: Date;
}

const toOwnerSessionResponse = (session: OwnerRepositorySession, ownerSessionToken?: string) => ({
  userId: session.user.id,
  ownerProfileId: session.ownerProfile.id,
  email: session.user.email,
  emailVerified: Boolean(session.user.emailVerified),
  ownerSessionToken
});

const allowedOwnerImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const maxOwnerMediaBytes = 20 * 1024 * 1024;
const withPaymentDetails = (booking: BookingIntent, paymentMode: PaymentMode): BookingIntent => ({
  ...booking,
  paymentMode,
  paymentInstructions: getPaymentInstructions(paymentMode),
  price: {
    amount: booking.totalPrice,
    currency: booking.currency,
    unit: "booking"
  }
});

const createRateLimiter = () => {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (scope: string, key: string, limit: number, windowMs: number) => {
    const now = Date.now();
    const bucketKey = `${scope}:${key}`;
    const bucket = buckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
  };
};

const getPrismaDatabaseUrl = (config: RuntimeConfig) => {
  const databaseUrl = config.databaseUrl?.trim();
  if (!databaseUrl || process.env.NODE_ENV === "test") return undefined;
  return /USER:PASSWORD|replace-with-|your-domain\.com/i.test(databaseUrl) ? undefined : databaseUrl;
};

const extractOwnerDraftPrice = (text: string) => {
  const match = text.match(/(\d[\d\s.,]*)\s*(czk|kč|eur|€)/i);
  if (!match) return undefined;
  const amount = Number(match[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : undefined;
};

const knownIds = <T extends string>(values: string[] | undefined, dictionary: Record<string, unknown>) =>
  (values ?? []).filter((value): value is T => Object.prototype.hasOwnProperty.call(dictionary, value));

export const buildServer = (options: BuildServerOptions = {}) => {
  const config = loadRuntimeConfig(options.config);
  const fetchImpl = options.fetch ?? fetch;
  const prismaDatabaseUrl = getPrismaDatabaseUrl(config);
  const ownerRepository = options.services?.ownerRepository ?? (
    prismaDatabaseUrl
      ? createPrismaOwnerRepository(createPrismaClient(prismaDatabaseUrl))
      : createInMemoryOwnerRepository()
  );
  const emailService = options.services?.email ?? (
    config.resendApiKey && config.emailFrom
      ? createResendEmailService({ apiKey: config.resendApiKey, from: config.emailFrom })
      : createEmailService({
          async send() {
            return { id: "email_disabled" };
          }
        })
  );
  const storageService = options.services?.storage ?? (
    config.r2AccountId && config.r2AccessKeyId && config.r2SecretAccessKey && config.r2Bucket && config.r2PublicBaseUrl
      ? createR2StorageService({
          accountId: config.r2AccountId,
          accessKeyId: config.r2AccessKeyId,
          secretAccessKey: config.r2SecretAccessKey,
          bucket: config.r2Bucket,
          publicBaseUrl: config.r2PublicBaseUrl
        })
      : createStorageService({
          publicBaseUrl: config.r2PublicBaseUrl ?? "https://media.local",
          async putObject() {
            return undefined;
          }
        })
  );
  const createOtpCode = options.services?.createOtpCode ?? createSixDigitCode;
  const paymentMode = getPaymentMode({ manualPaymentMode: config.manualPaymentMode === true });
  const allowRequest = createRateLimiter();
  const rateLimitKey = (request: { headers: Record<string, unknown>; ip?: string }) =>
    String(request.headers["x-forwarded-for"] ?? request.headers["user-agent"] ?? request.ip ?? "anonymous");
  const ownerOnboardingService = createOwnerOnboardingService({
    repository: ownerRepository,
    ai: {
      async createListingDraft(text) {
        const result = await generateListingDraft(text, config, fetchImpl);
        return {
          description: result.draft.description || result.draft.tagline,
          suggestedAmenities: result.draft.amenityIds,
          suggestedRules: result.draft.rules,
          suggestedRooms: []
        };
      }
    }
  });
  const latestTelegramDraftByUser = new Map<string, string>();
  const createAiDraft = async (text: string) => {
    try {
      const result = await generateListingDraft(text, config, fetchImpl);
      return {
        studioName: undefined,
        city: undefined,
        description: result.draft.description || result.draft.tagline,
        suggestedAmenities: result.draft.amenityIds,
        suggestedRules: result.draft.rules,
        suggestedRooms: []
      };
    } catch {
      return {
        description: text,
        suggestedAmenities: [],
        suggestedRules: [],
        suggestedRooms: []
      };
    }
  };
  const telegramOwnerServices = options.services?.telegramOwner ?? {
    async createDraftFromTelegram(input) {
      const owner = await ownerRepository.findOrCreateOwnerByTelegram({
        telegramUserId: input.telegramUserId,
        username: input.username,
        firstName: input.firstName
      });
      const draft = await ownerRepository.createDraft({
        ownerProfileId: owner.ownerProfile.id,
        source: "telegram",
        rawText: input.text
      });
      const aiDraft = await createAiDraft(draft.rawText);
      const saved = await ownerRepository.saveAiDraft({
        draftId: draft.id,
        aiDraftJson: aiDraft,
        status: "draft_ready"
      });
      latestTelegramDraftByUser.set(input.telegramUserId, saved.id);

      return {
        id: saved.id,
        studioName: aiDraft.studioName,
        city: aiDraft.city,
        missingFields: [
          !aiDraft.studioName && "studioName",
          !aiDraft.city && "city",
          !aiDraft.description && "description",
          "price"
        ].filter(Boolean) as string[]
      };
    },
    async attachTelegramPhoto(input) {
      const owner = await ownerRepository.findOrCreateOwnerByTelegram({
        telegramUserId: input.telegramUserId
      });
      let draftId = latestTelegramDraftByUser.get(input.telegramUserId);
      if (!draftId) {
        const draft = await ownerRepository.createDraft({
          ownerProfileId: owner.ownerProfile.id,
          source: "telegram",
          rawText: ""
        });
        draftId = draft.id;
        latestTelegramDraftByUser.set(input.telegramUserId, draftId);
      }
      const fileName = `${input.fileId}.jpg`;
      const uploaded = await storageService.uploadOwnerMedia({
        ownerId: owner.ownerProfile.id,
        fileName,
        mimeType: input.mimeType,
        bytes: input.bytes
      });
      const media = await ownerRepository.attachMedia({
        ownerProfileId: owner.ownerProfile.id,
        draftId,
        kind: "interior",
        fileName,
        mimeType: input.mimeType,
        storageKey: uploaded.storageKey,
        publicUrl: uploaded.publicUrl
      });

      return {
        id: media.id,
        fileName: media.fileName
      };
    }
  } satisfies TelegramOwnerServices;
  const fetchTelegramFileBytes = async (fileId: string) => {
    if (!config.telegramBotToken?.trim()) return Buffer.alloc(0);
    const fileResponse = await fetchImpl(`https://api.telegram.org/bot${config.telegramBotToken}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId })
    });
    const filePayload = await fileResponse.json() as { ok?: boolean; result?: { file_path?: string } };
    const filePath = filePayload.result?.file_path;
    if (!fileResponse.ok || !filePath) return Buffer.alloc(0);

    const bytesResponse = await fetchImpl(`https://api.telegram.org/file/bot${config.telegramBotToken}/${filePath}`);
    if (!bytesResponse.ok) return Buffer.alloc(0);
    return Buffer.from(await bytesResponse.arrayBuffer());
  };
  const telegramBot = createTelegramBotHandler({
    services: telegramOwnerServices,
    fetchFileBytes: fetchTelegramFileBytes
  });
  const emailOtpChallenges: EmailOtpChallengeRecord[] = [];
  let emailChallengeCount = 0;
  const app = Fastify({ logger: false });
  const studios = seedStudios.map((studio) => ({
    ...studio,
    rooms: studio.rooms.map((room) => ({ ...room })),
    images: studio.images.map((image) => ({ ...image })),
    moodTags: [...studio.moodTags],
    shootTypes: [...studio.shootTypes],
    featureIds: [...studio.featureIds],
    equipmentIds: [...studio.equipmentIds],
    amenityIds: [...studio.amenityIds],
    props: [...studio.props],
    rules: [...studio.rules]
  }));
  const toOwnerDraftPublicShape = (draft: Awaited<ReturnType<OwnerRepository["listPublishedDrafts"]>>[number]) => {
    const aiDraft = (draft.aiDraftJson ?? {}) as {
      studioName?: string;
      city?: string;
      description?: string;
      suggestedAmenities?: string[];
      suggestedRules?: string[];
      suggestedRooms?: Array<{
        name: string;
        styleTags?: string[];
        lightTags?: string[];
        props?: string[];
      }>;
    };
    return {
      id: draft.id,
      source: draft.source,
      status: draft.status,
      rawText: draft.rawText,
      studioName: aiDraft.studioName,
      city: aiDraft.city,
      description: aiDraft.description,
      suggestedAmenities: aiDraft.suggestedAmenities ?? [],
      suggestedRules: aiDraft.suggestedRules ?? [],
      suggestedRooms: (aiDraft.suggestedRooms ?? []).map((room) => ({
        name: room.name,
        styleTags: room.styleTags ?? [],
        lightTags: room.lightTags ?? [],
        props: room.props ?? []
      })),
      media: [],
      missingFields: []
    };
  };
  const createStudioFromPublishedOwnerDraft = async (
    draft: Awaited<ReturnType<OwnerRepository["listPublishedDrafts"]>>[number]
  ): Promise<Studio> => {
    const publicDraft = toOwnerDraftPublicShape(draft);
    const slug = ownerDraftPublishing.publishedStudioSlug(publicDraft);
    const media = await ownerRepository.getDraftMedia(draft.id);
    const priceFrom = extractOwnerDraftPrice(draft.rawText) ?? 1000;
    const featureIds = knownIds<FeatureId>(publicDraft.suggestedAmenities, taxonomy.features);
    const amenityIds = knownIds<AmenityId>(publicDraft.suggestedAmenities, taxonomy.amenities);
    const roomImageIds = media
      .filter((item) => item.mimeType.startsWith("image/"))
      .map((item) => `owner-${item.id}`);
    const images = media
      .filter((item) => item.mimeType.startsWith("image/"))
      .map((item, index) => ({
        id: `owner-${item.id}`,
        url: item.publicUrl,
        alt: `${ownerDraftPublishing.inferStudioName(publicDraft)} uploaded studio photo ${index + 1}`,
        kind: index === 0 ? "hero" as const : item.kind === "equipment" ? "equipment" as const : item.kind === "sample" ? "example" as const : "room" as const,
        roomId: `${slug}-main`
      }));

    return {
      id: slug,
      slug,
      name: ownerDraftPublishing.inferStudioName(publicDraft),
      city: seedStudios[0].city,
      district: ownerDraftPublishing.inferCity(publicDraft),
      addressHint: ownerDraftPublishing.inferCity(publicDraft),
      latitude: seedStudios[0].latitude,
      longitude: seedStudios[0].longitude,
      rating: 0,
      reviewCount: 0,
      priceFrom,
      currency: seedStudios[0].currency,
      bookingMode: "request",
      ownerName: "Studio owner",
      listingStatus: "published",
      tagline: publicDraft.description || publicDraft.rawText || "Owner-submitted studio available by request.",
      description: publicDraft.description || publicDraft.rawText || "Owner-submitted studio available by request.",
      moodTags: ["owner-submitted"],
      shootTypes: [],
      featureIds,
      equipmentIds: [],
      amenityIds,
      props: [],
      accessNotes: "Confirm access details directly with the studio.",
      cancellationPolicy: "Confirm cancellation terms directly with the studio.",
      images: images.length > 0 ? images : [{
        id: `${slug}-hero`,
        url: seedStudios[0].images[0].url,
        alt: `${ownerDraftPublishing.inferStudioName(publicDraft)} studio placeholder`,
        kind: "hero"
      }],
      rooms: [{
        id: `${slug}-main`,
        name: publicDraft.suggestedRooms[0]?.name || "Main Studio Room",
        summary: publicDraft.description || publicDraft.rawText || "Owner-submitted studio room.",
        areaSqm: 60,
        ceilingHeightM: 3,
        capacity: 8,
        pricePerHour: priceFrom,
        bookingMode: "request",
        featureIds,
        equipmentIds: [],
        imageIds: roomImageIds
      }],
      rules: publicDraft.suggestedRules
    };
  };
  const getCatalogStudios = async () => [
    ...studios,
    ...await Promise.all((await ownerRepository.listPublishedDrafts()).map(createStudioFromPublishedOwnerDraft))
  ];
  const bookingIntentStore = createJsonResourceStore<BookingIntent>(config.localDataDir, "booking-intents.json");
  const shortlistStore = createJsonResourceStore<SharedShortlist>(config.localDataDir, "shared-shortlists.json");
  const availabilityBlockStore = createJsonResourceStore<OwnerAvailabilityBlock>(config.localDataDir, "availability-blocks.json");
  const sessionStore = createJsonResourceStore<UserSession>(config.localDataDir, "sessions.json");
  const supportTicketStore = createJsonResourceStore<SupportTicket>(config.localDataDir, "support-tickets.json");
  const referralStore = createJsonResourceStore<ReferralRecord>(config.localDataDir, "referrals.json");
  const publicMetricStore = createJsonResourceStore<PublicApiMetric>(config.localDataDir, "public-api-metrics.json");
  const listingDraftStore = createListingDraftStore(config.localDataDir);
  const reviews: StudioReview[] = [];
  let reviewCount = 0;
  const isBlockedSlot = (block: OwnerAvailabilityBlock, slot: AvailabilitySlot) =>
    (block.kind ?? "hold") === "hold" &&
    block.studioSlug === slot.studioSlug &&
    block.roomId === slot.roomId &&
    block.date === slot.date &&
    (block.startTime === slot.startTime || block.startTime === "full-day");
  const isOpenOverrideSlot = (block: OwnerAvailabilityBlock, slot: AvailabilitySlot) =>
    block.kind === "open" &&
    block.studioSlug === slot.studioSlug &&
    block.roomId === slot.roomId &&
    block.date === slot.date &&
    block.startTime === slot.startTime;
  const toPublicStudio = (studio: Studio) => ({
    id: studio.id,
    slug: studio.slug,
    name: studio.name,
    city: studio.city,
    district: studio.district,
    addressHint: studio.addressHint,
    latitude: studio.latitude,
    longitude: studio.longitude,
    rating: studio.rating,
    reviewCount: studio.reviewCount,
    priceFrom: studio.priceFrom,
    currency: studio.currency,
    bookingMode: studio.bookingMode,
    tagline: studio.tagline,
    description: studio.description,
    moodTags: studio.moodTags,
    shootTypes: studio.shootTypes,
    featureIds: studio.featureIds,
    equipmentIds: studio.equipmentIds,
    amenityIds: studio.amenityIds,
    images: studio.images,
    rooms: studio.rooms,
    props: studio.props,
    rules: studio.rules
  });
  const recordPublicMetric = async (path: string) => {
    const metrics = await publicMetricStore.list();
    const existing = metrics.find((metric) => metric.path === path);
    const nextMetric: PublicApiMetric = {
      path,
      count: (existing?.count ?? 0) + 1,
      lastSeenAt: new Date().toISOString()
    };
    await publicMetricStore.setAll([
      nextMetric,
      ...metrics.filter((metric) => metric.path !== path)
    ]);
  };
  const currentSession = async () => (await sessionStore.list())[0] ?? defaultSession;
  const requireAdmin = async (reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }) => {
    const session = await currentSession();
    if (session.role === "admin") return false;

    return reply.code(403).send({
      error: "ADMIN_ROLE_REQUIRED",
      message: "Admin role is required for listing moderation"
    });
  };
  const toListingReviewItem = (studio: Studio): ListingReviewItem => ({
    studioSlug: studio.slug,
    studioName: studio.name,
    ownerName: studio.ownerName,
    district: studio.district,
    tagline: studio.tagline,
    listingStatus: studio.listingStatus
  });

  app.register(cors, {
    origin: true
  });
  app.register(multipart, {
    limits: {
      fileSize: maxOwnerMediaBytes
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "studio-market-api"
  }));

  app.get("/robots.txt", async (_request, reply) => {
    reply.type("text/plain");
    return "User-agent: *\nDisallow: /\n";
  });

  app.get("/readiness", async () => getLaunchReadiness(config));
  app.get("/api/readiness", async () => getProductionOnboardingReadiness(config));

  app.post<{
    Body: {
      ownerDraftId?: string;
      email?: string;
    };
  }>("/api/owner/email-codes", async (request, reply) => {
    const email = request.body.email ? normalizeEmail(request.body.email) : "";
    if (!email || !email.includes("@")) {
      return reply.code(400).send({
        error: "INVALID_OWNER_EMAIL",
        message: "A valid email is required for backup access."
      });
    }

    const session = await ownerRepository.findOrCreateOwnerByEmail(email);
    const code = createOtpCode();
    emailOtpChallenges.unshift({
      id: `email_code_${++emailChallengeCount}`,
      userId: session.user.id,
      email,
      codeHash: await hashOtpCode(code),
      expiresAt: createOtpExpiry()
    });
    try {
      await emailService.sendOwnerOtp({ to: email, code });
    } catch {
      return reply.code(502).send({
        error: "EMAIL_SEND_FAILED",
        message: "Email sender rejected the access code. Check the verified sender domain in Resend."
      });
    }

    return {
      ok: true,
      email
    };
  });

  app.post<{
    Body: {
      email?: string;
      code?: string;
    };
  }>("/api/owner/email-codes/verify", async (request, reply) => {
    const email = request.body.email ? normalizeEmail(request.body.email) : "";
    const code = request.body.code?.trim() ?? "";
    if (!email || !/^\d{6}$/.test(code)) {
      return reply.code(400).send({
        error: "INVALID_OWNER_EMAIL_CODE",
        message: "Enter the 6-digit email code."
      });
    }

    const challenge = emailOtpChallenges.find(
      (item) => item.email === email && !item.consumedAt && item.expiresAt > new Date()
    );
    if (!challenge || !(await verifyOtpCode(code, challenge.codeHash))) {
      return reply.code(400).send({
        error: "INVALID_OWNER_EMAIL_CODE",
        message: "The email code is invalid or expired."
      });
    }

    challenge.consumedAt = new Date();
    const session = await ownerRepository.markEmailVerified({
      userId: challenge.userId,
      email,
      verifiedAt: challenge.consumedAt
    });
    const ownerSessionToken = createOwnerSessionToken({ userId: session.user.id, email });

    return {
      session: toOwnerSessionResponse(session, ownerSessionToken)
    };
  });

  app.get<{
    Querystring: {
      ownerSessionToken?: string;
    };
  }>("/api/owner/session", async (request, reply) => {
    const token = request.query.ownerSessionToken;
    const parsed = token ? parseOwnerSessionToken(token) : null;
    if (!parsed) {
      return reply.code(401).send({
        error: "INVALID_OWNER_SESSION",
        message: "Owner session token is required."
      });
    }
    const session = await ownerRepository.getOwnerSession(parsed.userId);
    if (!session) {
      return reply.code(404).send({
        error: "OWNER_SESSION_NOT_FOUND",
        message: "Owner session was not found."
      });
    }

    return {
      session: toOwnerSessionResponse(session, token)
    };
  });

  app.post("/api/owner/media", async (request, reply) => {
    const fields: Record<string, string> = {};
    let uploadedFile: { fileName: string; mimeType: string; bytes: Buffer } | undefined;

    try {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          const bytes = await part.toBuffer();
          uploadedFile = {
            fileName: part.filename,
            mimeType: part.mimetype,
            bytes
          };
        } else {
          fields[part.fieldname] = String(part.value ?? "");
        }
      }
    } catch (error) {
      return reply.code(400).send({
        error: "OWNER_MEDIA_TOO_LARGE",
        message: error instanceof Error ? error.message : "Owner media upload failed."
      });
    }

    const parsed = fields.ownerSessionToken ? parseOwnerSessionToken(fields.ownerSessionToken) : null;
    if (!parsed) {
      return reply.code(401).send({
        error: "INVALID_OWNER_SESSION",
        message: "Owner session token is required."
      });
    }
    const session = await ownerRepository.getOwnerSession(parsed.userId);
    if (!session) {
      return reply.code(404).send({
        error: "OWNER_SESSION_NOT_FOUND",
        message: "Owner session was not found."
      });
    }
    if (!uploadedFile || uploadedFile.bytes.length === 0) {
      return reply.code(400).send({
        error: "EMPTY_OWNER_MEDIA",
        message: "Upload a non-empty image file."
      });
    }
    if (!allowedOwnerImageTypes.has(uploadedFile.mimeType)) {
      return reply.code(400).send({
        error: "UNSUPPORTED_OWNER_MEDIA_TYPE",
        message: "Owner media must be JPEG, PNG, WebP, or HEIC."
      });
    }

    const uploaded = await storageService.uploadOwnerMedia({
      ownerId: session.ownerProfile.id,
      fileName: uploadedFile.fileName,
      mimeType: uploadedFile.mimeType,
      bytes: uploadedFile.bytes
    });
    const media = await ownerRepository.attachMedia({
      ownerProfileId: session.ownerProfile.id,
      draftId: fields.draftId || undefined,
      kind: "interior",
      fileName: uploadedFile.fileName,
      mimeType: uploadedFile.mimeType,
      storageKey: uploaded.storageKey,
      publicUrl: uploaded.publicUrl
    });

    return {
      media: {
        id: media.id,
        kind: media.kind,
        fileName: media.fileName,
        mimeType: media.mimeType,
        publicUrl: media.publicUrl,
        sortOrder: media.sortOrder
      }
    };
  });

  app.post<{
    Body: {
      source?: unknown;
      text?: string;
    };
  }>("/api/owner/onboarding/start", async (request, reply) => {
    if (!allowRequest("owner-onboarding", rateLimitKey(request), 30, 60_000)) {
      return reply.code(429).send({
        error: "RATE_LIMITED",
        message: "Too many owner onboarding requests. Try again shortly."
      });
    }

    const text = request.body.text?.trim();
    const source = request.body.source === "telegram" ? "telegram" : request.body.source === "web" ? "web" : undefined;
    if (!text || !source) {
      return reply.code(400).send({
        error: "INVALID_OWNER_ONBOARDING_START",
        message: "Owner onboarding needs source and text."
      });
    }

    return {
      draft: await ownerOnboardingService.createDraftFromText({ source, text })
    };
  });

  app.post<{
    Params: { draftId: string };
    Body: { text?: string };
  }>("/api/owner/onboarding/:draftId/messages", async (request, reply) => {
    const text = request.body.text?.trim();
    if (!text) {
      return reply.code(400).send({
        error: "INVALID_OWNER_ONBOARDING_MESSAGE",
        message: "Message text is required."
      });
    }
    try {
      return {
        draft: await ownerOnboardingService.appendText({
          draftId: request.params.draftId,
          text
        })
      };
    } catch (error) {
      return reply.code(404).send({
        error: "OWNER_DRAFT_NOT_FOUND",
        message: error instanceof Error ? error.message : "Owner draft was not found."
      });
    }
  });

  app.get<{ Params: { draftId: string } }>("/api/owner/onboarding/:draftId", async (request, reply) => {
    try {
      return {
        draft: await ownerOnboardingService.attachMedia({ draftId: request.params.draftId })
      };
    } catch (error) {
      return reply.code(404).send({
        error: "OWNER_DRAFT_NOT_FOUND",
        message: error instanceof Error ? error.message : "Owner draft was not found."
      });
    }
  });

  app.post<{ Params: { draftId: string } }>("/api/owner/onboarding/:draftId/regenerate", async (request, reply) => {
    try {
      return {
        draft: await ownerOnboardingService.regenerateDraft({ draftId: request.params.draftId })
      };
    } catch (error) {
      return reply.code(404).send({
        error: "OWNER_DRAFT_NOT_FOUND",
        message: error instanceof Error ? error.message : "Owner draft was not found."
      });
    }
  });

  app.post<{
    Params: { draftId: string };
    Body: { ownerSessionToken?: string };
  }>("/api/owner/onboarding/:draftId/publish", async (request, reply) => {
    try {
      return {
        listing: await ownerOnboardingService.publishDraft({
          draftId: request.params.draftId,
          ownerSessionToken: request.body.ownerSessionToken ?? ""
        })
      };
    } catch (error) {
      return reply.code(403).send({
        error: "OWNER_DRAFT_NOT_PUBLISHABLE",
        message: error instanceof Error ? error.message : "Owner draft cannot be published."
      });
    }
  });

  app.get("/session", async () => ({
    session: (await sessionStore.list())[0] ?? defaultSession
  }));

  app.patch<{
    Body: {
      role?: unknown;
      displayName?: string;
    };
  }>("/session", async (request, reply) => {
    if (!isUserRole(request.body.role)) {
      return reply.code(400).send({
        error: "INVALID_SESSION_ROLE",
        message: "Session role must be client, photographer, studio_owner, or admin"
      });
    }

    const current = (await sessionStore.list())[0] ?? defaultSession;
    const session: UserSession = {
      ...current,
      role: request.body.role,
      displayName: request.body.displayName?.trim() || current.displayName
    };
    await sessionStore.setAll([session]);

    return {
      session
    };
  });

  app.post<{
    Body: {
      category?: unknown;
      priority?: unknown;
      message?: string;
      includeActivity?: boolean;
      screen?: string;
      userRole?: unknown;
      currentView?: string;
      currentStudioId?: string;
      currentDraftId?: string;
      relatedStudioSlug?: string;
      relatedBookingId?: string;
      relatedShortlistId?: string;
      events?: SupportEvent[];
      sessionEvents?: SupportEvent[];
      userAgent?: string;
    };
  }>("/support/tickets", async (request, reply) => {
    if (request.body.category !== undefined && !isSupportCategory(request.body.category)) {
      return reply.code(400).send({
        error: "INVALID_SUPPORT_CATEGORY",
        message: "Support category is required"
      });
    }
    if (request.body.priority !== undefined && !isSupportPriority(request.body.priority)) {
      return reply.code(400).send({
        error: "INVALID_SUPPORT_PRIORITY",
        message: "Support priority must be low, medium, or high"
      });
    }

    const message = request.body.message?.trim();
    if (!message) {
      return reply.code(400).send({
        error: "INVALID_SUPPORT_MESSAGE",
        message: "Support message is required"
      });
    }
    if (!allowRequest("support", rateLimitKey(request), 20, 60_000)) {
      return reply.code(429).send({
        error: "RATE_LIMITED",
        message: "Too many support requests. Try again shortly."
      });
    }

    const tickets = await supportTicketStore.list();
    const triage = request.body.category
      ? {
          category: request.body.category,
          priority: isSupportPriority(request.body.priority) ? request.body.priority : "medium",
          triageReason: "Submitted with an existing internal category."
        }
      : triageSupportTicket(message);
    const session = (await sessionStore.list())[0] ?? defaultSession;
    const currentView = request.body.currentView?.trim() || request.body.screen?.trim() || "unknown";
    const sessionEvents = request.body.includeActivity === false
      ? []
      : request.body.sessionEvents ?? request.body.events ?? [];
    const ticket: SupportTicket = {
      id: `support-ticket-${tickets.length + 1}`,
      category: triage.category,
      priority: isSupportPriority(request.body.priority) ? request.body.priority : triage.priority,
      triageReason: triage.triageReason,
      message,
      includeActivity: request.body.includeActivity ?? true,
      session,
      userRole: isSupportUserRole(request.body.userRole) ? request.body.userRole : session.role,
      screen: request.body.screen?.trim() || currentView,
      currentView,
      currentStudioId: request.body.currentStudioId?.trim() || request.body.relatedStudioSlug,
      currentDraftId: request.body.currentDraftId?.trim() || undefined,
      relatedStudioSlug: request.body.relatedStudioSlug,
      relatedBookingId: request.body.relatedBookingId,
      relatedShortlistId: request.body.relatedShortlistId,
      events: sessionEvents,
      sessionEvents,
      userAgent: request.body.userAgent,
      createdAt: new Date().toISOString()
    };
    await supportTicketStore.setAll([ticket, ...tickets]);

    return reply.code(201).send({
      ticket
    });
  });

  app.get("/support/tickets", async () => ({
    tickets: await supportTicketStore.list()
  }));

  app.post<{
    Body: {
      source?: unknown;
      path?: string;
    };
  }>("/referrals", async (request, reply) => {
    const referrals = await referralStore.list();
    const referral: ReferralRecord = {
      id: `referral-${referrals.length + 1}`,
      source: isReferralSource(request.body.source) ? request.body.source : "unknown",
      path: request.body.path?.trim() || "unknown",
      session: (await sessionStore.list())[0] ?? defaultSession,
      createdAt: new Date().toISOString()
    };
    await referralStore.setAll([referral, ...referrals]);

    return reply.code(201).send({
      referral
    });
  });

  app.get("/referrals/summary", async () => {
    const referrals = await referralStore.list();
    const bySource = referrals.reduce<ReferralSourceTotals>(
      (totals, referral) => ({
        ...totals,
        [referral.source]: totals[referral.source] + 1
      }),
      { ...referralSourceLabels }
    );

    return {
      total: referrals.length,
      bySource,
      recent: referrals.slice(0, 6)
    };
  });

  app.post<{
    Body: {
      transcript?: string;
    };
  }>("/ai/listing-draft", async (request, reply) => {
    const transcript = request.body.transcript?.trim();

    if (!transcript) {
      return reply.code(400).send({
        error: "INVALID_LISTING_DRAFT",
        message: "Transcript is required"
      });
    }

    return generateListingDraft(transcript, config, fetchImpl);
  });

  app.post<{
    Body: {
      caption?: string;
      imageUrl?: string;
      rooms?: Array<{ id: string; name: string }>;
    };
  }>("/ai/media-suggestion", async (request, reply) => {
    const caption = request.body.caption?.trim();
    const imageUrl = request.body.imageUrl?.trim();

    if (!caption && !imageUrl) {
      return reply.code(400).send({
        error: "INVALID_MEDIA_SUGGESTION",
        message: "Caption or imageUrl is required"
      });
    }

    return suggestMediaDetails(
      {
        caption,
        imageUrl,
        rooms: request.body.rooms ?? []
      },
      config,
      fetchImpl
    );
  });

  app.post<{
    Headers: {
      "x-telegram-bot-api-secret-token"?: string;
    };
    Body: unknown;
  }>("/integrations/telegram/listing-draft", async (request, reply) => {
    if (!isTelegramSecretValid(config.telegramWebhookSecret, request.headers["x-telegram-bot-api-secret-token"])) {
      return reply.code(401).send({
        error: "INVALID_TELEGRAM_SECRET",
        message: "Telegram webhook secret token did not match"
      });
    }

    const transcript = extractTelegramText(request.body).trim();

    if (!transcript) {
      return {
        ok: true,
        ignored: true,
        reason: "No text or caption was found in the Telegram update."
      };
    }

    const { draft, mode } = await generateListingDraft(transcript, config, fetchImpl);
    const chatId = extractTelegramChatId(request.body);
    const record = await listingDraftStore.add({
      source: "telegram",
      chatId,
      transcript,
      mode,
      draft,
      createdAt: new Date().toISOString()
    });
    const sentMessage = await sendTelegramListingDraftReply(chatId, record, config, fetchImpl);

    return {
      ok: true,
      draftId: record.id,
      mode,
      reply: "Listing draft ready. Open the owner dashboard to review and publish it.",
      webAppUrl: config.publicAppUrl || "http://localhost:5173",
      sentMessage,
      draft
    };
  });

  app.post<{
    Headers: {
      "x-telegram-bot-api-secret-token"?: string;
    };
    Body: unknown;
  }>("/api/telegram/webhook", async (request, reply) => {
    if (!allowRequest("telegram-webhook", rateLimitKey(request), 60, 60_000)) {
      return reply.code(429).send({
        error: "RATE_LIMITED",
        message: "Too many Telegram updates. Try again shortly."
      });
    }
    if (!isTelegramSecretValid(config.telegramWebhookSecret, request.headers["x-telegram-bot-api-secret-token"])) {
      return reply.code(401).send({
        error: "INVALID_TELEGRAM_SECRET",
        message: "Telegram webhook secret token did not match"
      });
    }

    return telegramBot.handleUpdate(request.body);
  });

  app.get("/owner/listing-drafts", async () => ({
    drafts: await listingDraftStore.list()
  }));

  app.get<{
    Querystring: {
      chatId?: string;
    };
  }>("/integrations/telegram/mini-app/drafts", async (request) => {
    const publicAppUrl = (config.publicAppUrl || "http://localhost:5173").replace(/\/$/, "");
    const drafts = await listingDraftStore.list();
    const chatDrafts = request.query.chatId
      ? drafts.filter((draft) => String(draft.chatId) === request.query.chatId)
      : drafts;

    return {
      ok: true,
      webAppUrl: `${publicAppUrl}/#telegram-drafts`,
      editorUrl: `${publicAppUrl}/#profile`,
      drafts: chatDrafts.map((draft) => ({
        ...draft,
        openEditorUrl: `${publicAppUrl}/#profile`
      }))
    };
  });

  app.post("/integrations/telegram/webhook", async (_request, reply) => {
    const missing = [
      !config.telegramBotToken?.trim() && "TELEGRAM_BOT_TOKEN",
      !config.publicAppUrl?.trim() && "PUBLIC_APP_URL"
    ].filter(Boolean) as string[];

    if (missing.length) {
      return reply.code(400).send({
        error: "TELEGRAM_SETUP_NOT_READY",
        missing,
        message: `Fill ${missing.join(" and ")} before registering the Telegram webhook.`
      });
    }

    try {
      return await registerTelegramListingDraftWebhook(config, fetchImpl);
    } catch (error) {
      return reply.code(502).send({
        error: "TELEGRAM_WEBHOOK_SETUP_FAILED",
        message: error instanceof Error ? error.message : "Telegram webhook setup failed"
      });
    }
  });

  app.get<{
    Querystring: {
      cityId?: string;
      query?: string;
      maxPrice?: string;
      shootType?: ShootType;
      featureIds?: string;
      equipmentIds?: string;
      amenityIds?: string;
      bookingMode?: BookingMode;
    };
  }>("/studios", async (request) => {
    const catalogStudios = await getCatalogStudios();
    const filters: StudioSearchFilters = {
      cityId: request.query.cityId,
      query: request.query.query,
      maxPrice: request.query.maxPrice ? Number(request.query.maxPrice) : undefined,
      shootType: request.query.shootType,
      featureIds: toArray<FeatureId>(request.query.featureIds),
      equipmentIds: toArray<EquipmentId>(request.query.equipmentIds),
      amenityIds: toArray<AmenityId>(request.query.amenityIds),
      bookingMode: request.query.bookingMode
    };
    const results = searchStudios(catalogStudios, filters);

    return {
      studios: results,
      total: results.length
    };
  });

  app.get<{ Params: { slug: string } }>("/studios/:slug", async (request, reply) => {
    const studio = findStudioBySlug(await getCatalogStudios(), request.params.slug);

    if (!studio) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    return { studio };
  });

  const sendPublicStudio = async (slug: string, metricPath: string, reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }) => {
    const studio = findStudioBySlug(await getCatalogStudios(), slug);

    if (!studio) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    await recordPublicMetric(metricPath);

    return { studio: toPublicStudio(studio) };
  };

  app.get<{ Params: { slug: string } }>("/public/studios/:slug", async (request, reply) => (
    sendPublicStudio(request.params.slug, `/public/studios/${request.params.slug}`, reply)
  ));

  app.get<{ Params: { slug: string } }>("/api/studios/:slug", async (request, reply) => (
    sendPublicStudio(request.params.slug, `/api/studios/${request.params.slug}`, reply)
  ));

  app.get<{
    Querystring: {
      limit?: string;
      cursor?: string;
      cityId?: string;
      query?: string;
      maxPrice?: string;
      shootType?: ShootType;
      featureIds?: string;
      equipmentIds?: string;
      amenityIds?: string;
      bookingMode?: BookingMode;
    };
  }>("/api/studios", async (request) => {
    const filters: StudioSearchFilters = {
      cityId: request.query.cityId,
      query: request.query.query,
      maxPrice: request.query.maxPrice ? Number(request.query.maxPrice) : undefined,
      shootType: request.query.shootType,
      featureIds: toArray<FeatureId>(request.query.featureIds),
      equipmentIds: toArray<EquipmentId>(request.query.equipmentIds),
      amenityIds: toArray<AmenityId>(request.query.amenityIds),
      bookingMode: request.query.bookingMode
    };
    const allResults = searchStudios(await getCatalogStudios(), filters);
    const start = Math.max(0, Number(request.query.cursor ?? 0) || 0);
    const limit = Math.min(24, Math.max(1, Number(request.query.limit ?? 12) || 12));
    const page = allResults.slice(start, start + limit);
    const nextCursor = start + limit < allResults.length ? String(start + limit) : undefined;

    return {
      studios: page.map(toPublicStudio),
      total: allResults.length,
      nextCursor
    };
  });

  app.get("/internal/public-metrics", async () => ({
    metrics: await publicMetricStore.list()
  }));

  app.get<{
    Params: { slug: string };
    Querystring: { date?: string; durationHours?: string };
  }>("/studios/:slug/availability", async (request, reply) => {
    const studio = findStudioBySlug(await getCatalogStudios(), request.params.slug);

    if (!studio) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    const date = request.query.date ?? new Date().toISOString().slice(0, 10);
    const durationHours = request.query.durationHours ? Number(request.query.durationHours) : 2;

    const availability = getAvailabilityForStudio(studio, date, durationHours);
    const availabilityBlocks = await availabilityBlockStore.list();

    return {
      availability: {
        ...availability,
        slots: availability.slots.map((slot) => ({
          ...slot,
          available:
            availabilityBlocks.some((block) => isOpenOverrideSlot(block, slot)) ||
            (slot.available && !availabilityBlocks.some((block) => isBlockedSlot(block, slot)))
        }))
      }
    };
  });

  app.get<{
    Querystring: { studioSlug?: string };
  }>("/owner/availability-blocks", async (request) => {
    const availabilityBlocks = await availabilityBlockStore.list();

    return {
      blocks: request.query.studioSlug
        ? availabilityBlocks.filter((block) => block.studioSlug === request.query.studioSlug)
        : availabilityBlocks
    };
  });

  app.post<{
    Body: Omit<OwnerAvailabilityBlock, "id">;
  }>("/owner/availability-blocks", async (request, reply) => {
    const studio = findStudioBySlug(await getCatalogStudios(), request.body.studioSlug);

    if (!studio) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    const room = studio.rooms.find((candidate) => candidate.id === request.body.roomId);
    if (!room) {
      return reply.code(400).send({
        error: "INVALID_AVAILABILITY_BLOCK",
        message: "Room was not found"
      });
    }

    const availabilityBlocks = await availabilityBlockStore.list();
    const block: OwnerAvailabilityBlock = {
      id: `block-${availabilityBlocks.length + 1}`,
      studioSlug: request.body.studioSlug,
      roomId: request.body.roomId,
      date: request.body.date,
      startTime: request.body.startTime,
      kind: request.body.kind ?? "hold",
      reason: request.body.reason
    };
    await availabilityBlockStore.setAll([...availabilityBlocks, block]);

    return reply.code(201).send({
      block
    });
  });

  app.delete<{ Params: { blockId: string } }>("/owner/availability-blocks/:blockId", async (request, reply) => {
    const availabilityBlocks = await availabilityBlockStore.list();
    const blockIndex = availabilityBlocks.findIndex((block) => block.id === request.params.blockId);

    if (blockIndex === -1) {
      return reply.code(404).send({
        error: "AVAILABILITY_BLOCK_NOT_FOUND",
        message: "Availability block was not found"
      });
    }

    await availabilityBlockStore.setAll(availabilityBlocks.filter((_, index) => index !== blockIndex));

    return {
      released: true
    };
  });

  app.post<{
    Body: BookingIntentRequest & { studioSlug: string };
  }>("/booking-requests", async (request, reply) => {
    const studio = findStudioBySlug(await getCatalogStudios(), request.body.studioSlug);

    if (!studio) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    try {
      const booking = createBookingIntent(studio, request.body);
      const pricedBooking = withPaymentDetails(booking, paymentMode);
      const bookingIntents = await bookingIntentStore.list();
      await bookingIntentStore.setAll([...bookingIntents, pricedBooking]);

      return reply.code(201).send({
        booking: pricedBooking
      });
    } catch (error) {
      return reply.code(400).send({
        error: "INVALID_BOOKING_REQUEST",
        message: error instanceof Error ? error.message : "Booking request is invalid"
      });
    }
  });

  app.get<{
    Querystring: {
      guestEmail?: string;
    };
  }>("/bookings", async (request) => {
    const bookingIntents = await bookingIntentStore.list();
    const bookings = request.query.guestEmail
      ? bookingIntents.filter((booking) => booking.guestEmail === request.query.guestEmail)
      : bookingIntents;

    return {
      bookings
    };
  });

  app.post<{
    Params: { bookingId: string };
    Body: StudioReviewRequest;
  }>("/bookings/:bookingId/review", async (request, reply) => {
    const bookingIntents = await bookingIntentStore.list();
    const booking = bookingIntents.find((candidate) => candidate.id === request.params.bookingId);

    if (!booking) {
      return reply.code(404).send({
        error: "BOOKING_NOT_FOUND",
        message: "Booking request was not found"
      });
    }

    if (booking.status !== "completed") {
      return reply.code(400).send({
        error: "BOOKING_NOT_COMPLETED",
        message: "Only completed bookings can be reviewed"
      });
    }

    if (reviews.some((review) => review.bookingId === booking.id)) {
      return reply.code(409).send({
        error: "REVIEW_ALREADY_EXISTS",
        message: "This booking already has a review"
      });
    }

    const studioIndex = studios.findIndex((studio) => studio.slug === booking.studioSlug);
    if (studioIndex === -1) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    try {
      const studio = applyStudioReview(studios[studioIndex], request.body.rating);
      studios[studioIndex] = studio;
      reviewCount += 1;
      const review: StudioReview = {
        id: `review-${reviewCount}`,
        bookingId: booking.id,
        studioSlug: booking.studioSlug,
        guestName: booking.guestName,
        rating: request.body.rating,
        comment: request.body.comment.trim(),
        createdAt: new Date().toISOString()
      };
      reviews.push(review);

      return reply.code(201).send({
        review,
        studio
      });
    } catch (error) {
      return reply.code(400).send({
        error: "INVALID_REVIEW",
        message: error instanceof Error ? error.message : "Review is invalid"
      });
    }
  });

  app.post<{
    Params: { bookingId: string };
  }>("/bookings/:bookingId/payment", async (request, reply) => {
    const bookingIntents = await bookingIntentStore.list();
    const bookingIndex = bookingIntents.findIndex((booking) => booking.id === request.params.bookingId);

    if (bookingIndex === -1) {
      return reply.code(404).send({
        error: "BOOKING_NOT_FOUND",
        message: "Booking request was not found"
      });
    }

    try {
      const booking = markBookingPaid(bookingIntents[bookingIndex]);
      bookingIntents[bookingIndex] = booking;
      await bookingIntentStore.setAll(bookingIntents);

      return {
        booking
      };
    } catch (error) {
      return reply.code(400).send({
        error: "INVALID_PAYMENT_STATE",
        message: error instanceof Error ? error.message : "Booking cannot be paid"
      });
    }
  });

  app.get<{
    Querystring: {
      studioSlug?: string;
    };
  }>("/owner/bookings", async (request) => {
    const bookingIntents = await bookingIntentStore.list();
    const bookings = request.query.studioSlug
      ? bookingIntents.filter((booking) => booking.studioSlug === request.query.studioSlug)
      : bookingIntents;

    return {
      bookings
    };
  });

  app.patch<{
    Params: { bookingId: string };
    Body: { decision: OwnerBookingDecision; ownerNote?: string };
  }>("/owner/bookings/:bookingId", async (request, reply) => {
    const bookingIntents = await bookingIntentStore.list();
    const bookingIndex = bookingIntents.findIndex((booking) => booking.id === request.params.bookingId);

    if (bookingIndex === -1) {
      return reply.code(404).send({
        error: "BOOKING_NOT_FOUND",
        message: "Booking request was not found"
      });
    }

    try {
      const booking = withPaymentDetails(decideBookingIntent(
        bookingIntents[bookingIndex],
        request.body.decision,
        request.body.ownerNote
      ), paymentMode);
      bookingIntents[bookingIndex] = booking;
      await bookingIntentStore.setAll(bookingIntents);

      return {
        booking
      };
    } catch (error) {
      return reply.code(400).send({
        error: "INVALID_BOOKING_DECISION",
        message: error instanceof Error ? error.message : "Booking decision is invalid"
      });
    }
  });

  app.post<{
    Params: { bookingId: string };
  }>("/owner/bookings/:bookingId/complete", async (request, reply) => {
    const bookingIntents = await bookingIntentStore.list();
    const bookingIndex = bookingIntents.findIndex((booking) => booking.id === request.params.bookingId);

    if (bookingIndex === -1) {
      return reply.code(404).send({
        error: "BOOKING_NOT_FOUND",
        message: "Booking request was not found"
      });
    }

    try {
      const booking = markBookingCompleted(bookingIntents[bookingIndex]);
      bookingIntents[bookingIndex] = booking;
      await bookingIntentStore.setAll(bookingIntents);

      return {
        booking
      };
    } catch (error) {
      return reply.code(400).send({
        error: "INVALID_BOOKING_COMPLETION",
        message: error instanceof Error ? error.message : "Booking cannot be completed"
      });
    }
  });

  app.patch<{
    Params: { slug: string };
    Body: OwnerListingUpdate;
  }>("/owner/studios/:slug", async (request, reply) => {
    const studioIndex = studios.findIndex((studio) => studio.slug === request.params.slug);

    if (studioIndex === -1) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    if (request.body.priceFrom !== undefined && request.body.priceFrom <= 0) {
      return reply.code(400).send({
        error: "INVALID_LISTING_UPDATE",
        message: "Price must be greater than zero"
      });
    }

    if (request.body.rooms?.some((room) => room.pricePerHour <= 0)) {
      return reply.code(400).send({
        error: "INVALID_LISTING_UPDATE",
        message: "Room price must be greater than zero"
      });
    }

    const current = studios[studioIndex];
    const updated = {
      ...current,
      tagline: request.body.tagline ?? current.tagline,
      description: request.body.description ?? current.description,
      priceFrom: request.body.priceFrom ?? current.priceFrom,
      bookingMode: request.body.bookingMode ?? current.bookingMode,
      shootTypes: request.body.shootTypes ?? current.shootTypes,
      featureIds: request.body.featureIds ?? current.featureIds,
      equipmentIds: request.body.equipmentIds ?? current.equipmentIds,
      amenityIds: request.body.amenityIds ?? current.amenityIds,
      rules: request.body.rules ?? current.rules,
      images: request.body.images ?? current.images,
      rooms: request.body.rooms ?? current.rooms,
      props: request.body.props ?? current.props,
      accessNotes: request.body.accessNotes ?? current.accessNotes,
      cancellationPolicy: request.body.cancellationPolicy ?? current.cancellationPolicy,
      listingStatus: request.body.listingStatus ?? current.listingStatus
    };
    studios[studioIndex] = updated;

    return {
      studio: updated
    };
  });

  app.get("/admin/listing-reviews", async (_request, reply) => {
    const forbidden = await requireAdmin(reply);
    if (forbidden) return forbidden;

    return {
      reviews: studios
        .filter((studio) => studio.listingStatus === "in_review")
        .map(toListingReviewItem)
    };
  });

  app.patch<{
    Params: { slug: string };
    Body: { decision?: ListingReviewDecision };
  }>("/admin/studios/:slug/review", async (request, reply) => {
    const forbidden = await requireAdmin(reply);
    if (forbidden) return forbidden;

    if (request.body.decision !== "approve" && request.body.decision !== "reject") {
      return reply.code(400).send({
        error: "INVALID_LISTING_REVIEW_DECISION",
        message: "Review decision must be approve or reject"
      });
    }

    const studioIndex = studios.findIndex((studio) => studio.slug === request.params.slug);
    if (studioIndex === -1) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    const updated = {
      ...studios[studioIndex],
      listingStatus: request.body.decision === "approve" ? "published" as const : "draft" as const
    };
    studios[studioIndex] = updated;

    return {
      studio: updated
    };
  });

  app.get("/taxonomy", async () => ({
    taxonomy
  }));

  app.post<{
    Body: {
      studioSlugs: string[];
      items?: SharedShortlistItem[];
    };
  }>("/shortlists", async (request, reply) => {
    const studioSlugs = Array.from(new Set(request.body.studioSlugs ?? []));

    if (!studioSlugs.length) {
      return reply.code(400).send({
        error: "INVALID_SHORTLIST",
        message: "Shortlist must include at least one studio"
      });
    }

    const missingSlug = studioSlugs.find((slug) => !findStudioBySlug(studios, slug));
    if (missingSlug) {
      return reply.code(400).send({
        error: "INVALID_SHORTLIST",
        message: `Studio ${missingSlug} was not found`
      });
    }

    const items = studioSlugs.map((studioSlug) => ({
      studioSlug,
      ...request.body.items?.find((item) => item.studioSlug === studioSlug)
    }));
    const shortlists = await shortlistStore.list();
    const shortlist: SharedShortlist = {
      id: `shortlist-${shortlists.length + 1}`,
      studioSlugs,
      items,
      createdAt: new Date().toISOString()
    };
    await shortlistStore.setAll([...shortlists, shortlist]);

    return reply.code(201).send({
      shortlist
    });
  });

  app.get<{ Params: { shortlistId: string } }>("/shortlists/:shortlistId", async (request, reply) => {
    const shortlists = await shortlistStore.list();
    const shortlist = shortlists.find((item) => item.id === request.params.shortlistId);

    if (!shortlist) {
      return reply.code(404).send({
        error: "SHORTLIST_NOT_FOUND",
        message: "Shortlist was not found"
      });
    }

    return {
      shortlist
    };
  });

  app.patch<{
    Params: { shortlistId: string };
    Body: {
      items: SharedShortlistItem[];
    };
  }>("/shortlists/:shortlistId", async (request, reply) => {
    const shortlists = await shortlistStore.list();
    const shortlistIndex = shortlists.findIndex((item) => item.id === request.params.shortlistId);

    if (shortlistIndex === -1) {
      return reply.code(404).send({
        error: "SHORTLIST_NOT_FOUND",
        message: "Shortlist was not found"
      });
    }

    const shortlist = shortlists[shortlistIndex];
    const invalidItem = request.body.items.find((item) => !shortlist.studioSlugs.includes(item.studioSlug));
    if (invalidItem) {
      return reply.code(400).send({
        error: "INVALID_SHORTLIST",
        message: `Studio ${invalidItem.studioSlug} is not part of this shortlist`
      });
    }

    const updated: SharedShortlist = {
      ...shortlist,
      items: shortlist.studioSlugs.map((studioSlug) => ({
        studioSlug,
        ...request.body.items.find((item) => item.studioSlug === studioSlug)
      }))
    };
    shortlists[shortlistIndex] = updated;
    await shortlistStore.setAll(shortlists);

    return {
      shortlist: updated
    };
  });

  return app;
};
