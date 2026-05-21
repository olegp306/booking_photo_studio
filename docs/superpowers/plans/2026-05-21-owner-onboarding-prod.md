# Owner Onboarding Production Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the app for a soft production launch where studio owners can create real listings through Telegram or an in-app owner chat, upload real photos immediately, verify email with a 6-digit code, return without passwords, and accept bookings with visible prices while payment happens directly at the studio.

**Architecture:** Add a production onboarding layer around the current React/Fastify prototype: shared domain types, Fastify services for owner identity, OTP, draft generation, media storage, Telegram intake, and booking payment mode; Prisma/PostgreSQL becomes the production persistence path, with narrow repository interfaces keeping business logic testable; Cloudflare R2 stores owner-uploaded media; Resend sends passwordless email codes; the web app exposes a persistent owner CTA and chat drawer that uses the same draft pipeline as Telegram.

**Tech Stack:** React, Vite, TypeScript, Node.js, Fastify, Vitest, Testing Library, Prisma, PostgreSQL, Resend, S3-compatible storage via Cloudflare R2, Telegram Bot API, OpenAI listing/media helpers.

---

## File Structure

Create and modify these files:

```text
apps/api/package.json
apps/api/prisma/schema.prisma
apps/api/src/auth.ts
apps/api/src/auth.test.ts
apps/api/src/db.ts
apps/api/src/email.ts
apps/api/src/email.test.ts
apps/api/src/env.ts
apps/api/src/index.ts
apps/api/src/ownerOnboarding.ts
apps/api/src/ownerOnboarding.test.ts
apps/api/src/ownerRepository.ts
apps/api/src/paymentMode.ts
apps/api/src/server.ts
apps/api/src/server.test.ts
apps/api/src/storage.ts
apps/api/src/storage.test.ts
apps/api/src/telegram.ts
apps/api/src/telegram.test.ts
apps/web/src/App.tsx
apps/web/src/App.test.tsx
apps/web/src/api.ts
apps/web/src/styles.css
packages/shared/src/types.ts
packages/shared/src/index.ts
.env.example
README.md
```

Do not commit `.env` or local media. Keep `.superpowers/` ignored.

---

## Phase 1: Environment, Dependencies, And Production Readiness Surface

**Purpose:** Make required production knobs explicit before adding features.

- [ ] Add API dependencies.

Command:

```powershell
npm install -w apps/api @prisma/client prisma @fastify/multipart @aws-sdk/client-s3 @aws-sdk/s3-request-presigner resend
```

- [ ] Add API scripts in `apps/api/package.json`.

Expected scripts:

```json
{
  "db:generate": "prisma generate --schema prisma/schema.prisma",
  "db:push": "prisma db push --schema prisma/schema.prisma",
  "db:migrate": "prisma migrate dev --schema prisma/schema.prisma",
  "db:studio": "prisma studio --schema prisma/schema.prisma"
}
```

- [ ] Write a failing environment test in `apps/api/src/server.test.ts`.

Test intent:

```ts
it("reports production onboarding readiness without exposing secrets", async () => {
  const app = buildServer({
    config: {
      mode: "test",
      manualPaymentMode: true,
      databaseUrl: "postgresql://user:pass@localhost:5432/photo",
      resendApiKey: "re_test",
      emailFrom: "Photo Studios <hello@example.com>",
      r2Bucket: "photo-studios",
      r2PublicBaseUrl: "https://media.example.com",
    },
  });

  const response = await app.inject({ method: "GET", url: "/api/readiness" });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    manualPaymentMode: true,
    database: "configured",
    email: "configured",
    mediaStorage: "configured",
  });
  expect(JSON.stringify(response.json())).not.toContain("re_test");
});
```

- [ ] Extend `apps/api/src/env.ts`.

Required env keys:

```text
DATABASE_URL
RESEND_API_KEY
EMAIL_FROM
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_PUBLIC_BASE_URL
TELEGRAM_BOT_TOKEN
OPENAI_API_KEY
MANUAL_PAYMENT_MODE
```

- [ ] Update `.env.example` with safe dummy values and comments.

Key copy:

```dotenv
# Soft launch: prices are visible, but clients pay the studio directly.
MANUAL_PAYMENT_MODE=true

# PostgreSQL used by Prisma.
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/photo_studios"

# Resend for 6-digit email codes.
RESEND_API_KEY="re_..."
EMAIL_FROM="Photo Studios <hello@your-domain.com>"

# Cloudflare R2 / S3-compatible media storage.
R2_ACCOUNT_ID="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET="photo-studios"
R2_PUBLIC_BASE_URL="https://media.your-domain.com"
```

- [ ] Run:

```powershell
npm test
npm run typecheck
```

- [ ] Commit:

```powershell
git add apps/api/package.json package-lock.json apps/api/src/env.ts apps/api/src/server.ts apps/api/src/server.test.ts .env.example
git commit -m "feat: expose production onboarding readiness"
git push origin main
```

---

## Phase 2: Prisma Schema And Repository Boundary

**Purpose:** Define production data shape while keeping services testable without a live database.

- [ ] Create `apps/api/prisma/schema.prisma`.

Models:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id             String             @id @default(cuid())
  email          String?            @unique
  emailVerified  DateTime?
  displayName    String?
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt
  ownerProfile   OwnerProfile?
  telegramLinks  TelegramIdentity[]
  emailCodes     EmailOtpChallenge[]
}

model OwnerProfile {
  id          String   @id @default(cuid())
  userId      String   @unique
  status      String   @default("draft")
  studioName  String?
  city        String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  drafts      OwnerOnboardingDraft[]
  media       OwnerMedia[]
}

model TelegramIdentity {
  id             String   @id @default(cuid())
  userId         String   @unique
  telegramUserId String   @unique
  username       String?
  firstName      String?
  createdAt      DateTime @default(now())
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model EmailOtpChallenge {
  id          String    @id @default(cuid())
  userId      String?
  email       String
  codeHash    String
  expiresAt   DateTime
  consumedAt  DateTime?
  createdAt   DateTime  @default(now())
  user        User?      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([email, expiresAt])
}

model OwnerOnboardingDraft {
  id             String   @id @default(cuid())
  ownerProfileId String
  source         String
  status         String   @default("collecting")
  rawText        String   @default("")
  aiDraftJson    Json?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  ownerProfile   OwnerProfile @relation(fields: [ownerProfileId], references: [id], onDelete: Cascade)
  media          OwnerMedia[]
}

model OwnerMedia {
  id             String   @id @default(cuid())
  ownerProfileId String
  draftId        String?
  kind           String
  fileName       String
  mimeType       String
  storageKey     String   @unique
  publicUrl      String
  sortOrder      Int      @default(0)
  aiTagsJson     Json?
  createdAt      DateTime @default(now())
  ownerProfile   OwnerProfile @relation(fields: [ownerProfileId], references: [id], onDelete: Cascade)
  draft          OwnerOnboardingDraft? @relation(fields: [draftId], references: [id], onDelete: SetNull)
}
```

- [ ] Create `apps/api/src/db.ts`.

Requirements:

```ts
import { PrismaClient } from "@prisma/client";

export function createPrismaClient(databaseUrl?: string): PrismaClient;
export type PrismaDatabase = ReturnType<typeof createPrismaClient>;
```

- [ ] Create `apps/api/src/ownerRepository.ts`.

Repository interface:

```ts
export interface OwnerRepository {
  findOrCreateOwnerByTelegram(input: TelegramOwnerInput): Promise<OwnerSession>;
  findOrCreateOwnerByEmail(email: string): Promise<OwnerSession>;
  getOwnerSession(userId: string): Promise<OwnerSession | null>;
  createDraft(input: CreateOwnerDraftInput): Promise<OwnerOnboardingDraft>;
  appendDraftText(input: AppendDraftTextInput): Promise<OwnerOnboardingDraft>;
  attachMedia(input: AttachOwnerMediaInput): Promise<OwnerMedia>;
  saveAiDraft(input: SaveAiDraftInput): Promise<OwnerOnboardingDraft>;
  markEmailVerified(input: MarkEmailVerifiedInput): Promise<OwnerSession>;
}
```

- [ ] Add an in-memory repository implementation for unit tests inside `apps/api/src/ownerRepository.ts` or a test helper exported from it.

- [ ] Generate Prisma client.

Command:

```powershell
npm run db:generate -w apps/api
```

- [ ] Run:

```powershell
npm test
npm run typecheck
```

- [ ] Commit:

```powershell
git add apps/api/prisma/schema.prisma apps/api/src/db.ts apps/api/src/ownerRepository.ts apps/api/package.json package-lock.json
git commit -m "feat: add owner onboarding data model"
git push origin main
```

---

## Phase 3: Passwordless Email OTP With Resend

**Purpose:** Owners can secure access after receiving an AI draft, using a 6-digit email code and no password.

- [ ] Create `apps/api/src/auth.test.ts`.

Tests:

```ts
import { createSixDigitCode, hashOtpCode, verifyOtpCode } from "./auth";

it("generates numeric 6 digit codes", () => {
  expect(createSixDigitCode()).toMatch(/^\d{6}$/);
});

it("verifies a code against its hash and rejects a different code", async () => {
  const hash = await hashOtpCode("123456");
  await expect(verifyOtpCode("123456", hash)).resolves.toBe(true);
  await expect(verifyOtpCode("654321", hash)).resolves.toBe(false);
});
```

- [ ] Implement `apps/api/src/auth.ts`.

Public API:

```ts
export function createSixDigitCode(): string;
export function normalizeEmail(email: string): string;
export function createOtpExpiry(now?: Date): Date;
export function createOwnerSessionToken(input: { userId: string; email?: string }): string;
export function parseOwnerSessionToken(token: string): { userId: string; email?: string } | null;
export function hashOtpCode(code: string): Promise<string>;
export function verifyOtpCode(code: string, hash: string): Promise<boolean>;
```

- [ ] Create `apps/api/src/email.test.ts`.

Test fake sender:

```ts
it("sends a friendly backup access email code", async () => {
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const email = createEmailService({
    send: async (message) => {
      sent.push(message);
      return { id: "email_1" };
    },
  });

  await email.sendOwnerOtp({
    to: "owner@example.com",
    code: "123456",
    studioName: "Studio Lumen",
  });

  expect(sent[0].subject).toContain("123456");
  expect(sent[0].html).toContain("so you do not lose access");
});
```

- [ ] Implement `apps/api/src/email.ts` with a Resend adapter and injectable test sender.

- [ ] Add API tests in `apps/api/src/server.test.ts`.

Endpoints:

```text
POST /api/owner/email-codes
POST /api/owner/email-codes/verify
GET  /api/owner/session
```

Expected behavior:

```ts
it("requests and verifies an owner email code", async () => {
  const app = buildServer({ services: testOwnerServices() });

  const requestCode = await app.inject({
    method: "POST",
    url: "/api/owner/email-codes",
    payload: { ownerDraftId: "draft_1", email: "Owner@Example.com" },
  });
  expect(requestCode.statusCode).toBe(200);
  expect(requestCode.json()).toMatchObject({ ok: true, email: "owner@example.com" });

  const verify = await app.inject({
    method: "POST",
    url: "/api/owner/email-codes/verify",
    payload: { email: "owner@example.com", code: "123456" },
  });
  expect(verify.statusCode).toBe(200);
  expect(verify.json().session.emailVerified).toBe(true);
});
```

- [ ] Implement server routes.

Rules:

```text
Codes are 6 digits.
Codes expire after 10 minutes.
Codes are stored hashed.
Consumed codes cannot be reused.
The user sees email collection after the first AI draft, not before.
Copy says email is for backup access and returning from web, not for marketing.
```

- [ ] Run:

```powershell
npm test
npm run typecheck
```

- [ ] Commit:

```powershell
git add apps/api/src/auth.ts apps/api/src/auth.test.ts apps/api/src/email.ts apps/api/src/email.test.ts apps/api/src/server.ts apps/api/src/server.test.ts
git commit -m "feat: add owner email verification codes"
git push origin main
```

---

## Phase 4: R2 Media Upload Pipeline

**Purpose:** Owners can upload real photos immediately from web chat and Telegram.

- [ ] Create `apps/api/src/storage.test.ts`.

Tests:

```ts
it("creates stable public urls for uploaded owner media", async () => {
  const uploads: Array<{ key: string; contentType: string }> = [];
  const storage = createStorageService({
    publicBaseUrl: "https://media.example.com",
    putObject: async (object) => {
      uploads.push({ key: object.key, contentType: object.contentType });
    },
  });

  const uploaded = await storage.uploadOwnerMedia({
    ownerId: "owner_1",
    fileName: "Room 1.JPG",
    mimeType: "image/jpeg",
    bytes: Buffer.from("image"),
  });

  expect(uploaded.publicUrl).toMatch(/^https:\/\/media\.example\.com\/owners\/owner_1\//);
  expect(uploaded.storageKey).toContain("room-1");
  expect(uploads[0].contentType).toBe("image/jpeg");
});
```

- [ ] Implement `apps/api/src/storage.ts`.

Public API:

```ts
export interface StorageService {
  uploadOwnerMedia(input: UploadOwnerMediaInput): Promise<UploadedOwnerMedia>;
}

export function createR2StorageService(config: R2StorageConfig): StorageService;
export function createStorageService(deps: StorageTestDeps): StorageService;
```

- [ ] Add multipart support to `apps/api/src/server.ts`.

Endpoint:

```text
POST /api/owner/media
```

Request:

```text
multipart/form-data
fields:
  ownerSessionToken
  draftId
  file
```

Response:

```json
{
  "media": {
    "id": "media_1",
    "kind": "interior",
    "fileName": "room.jpg",
    "mimeType": "image/jpeg",
    "publicUrl": "https://media.example.com/owners/owner_1/room.jpg"
  }
}
```

- [ ] Add image validation.

Rules:

```text
Accept image/jpeg, image/png, image/webp, image/heic.
Reject files above 20 MB.
Reject empty files.
Preserve original extension in storage key.
Use generated ids to avoid collisions.
```

- [ ] Add API tests for upload success and rejection of unsupported MIME type.

- [ ] Run:

```powershell
npm test
npm run typecheck
```

- [ ] Commit:

```powershell
git add apps/api/src/storage.ts apps/api/src/storage.test.ts apps/api/src/server.ts apps/api/src/server.test.ts apps/api/package.json package-lock.json
git commit -m "feat: add owner media uploads"
git push origin main
```

---

## Phase 5: Shared Owner Draft Pipeline

**Purpose:** Telegram and web chat produce the same AI-assisted listing draft.

- [ ] Extend shared types in `packages/shared/src/types.ts`.

Types:

```ts
export interface OwnerOnboardingDraft {
  id: string;
  source: "web" | "telegram";
  status: "collecting" | "draft_ready" | "email_pending" | "published";
  ownerSessionToken?: string;
  rawText: string;
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
  media: OwnerMedia[];
  missingFields: string[];
}

export interface OwnerMedia {
  id: string;
  fileName: string;
  mimeType: string;
  publicUrl: string;
  kind: "interior" | "equipment" | "sample" | "document";
  sortOrder: number;
}
```

- [ ] Create `apps/api/src/ownerOnboarding.test.ts`.

Tests:

```ts
it("creates a draft from owner text and flags missing fields", async () => {
  const service = createOwnerOnboardingService({
    repository: createInMemoryOwnerRepository(),
    ai: {
      createListingDraft: async () => ({
        studioName: "Loft Karlin",
        city: "Prague",
        description: "Bright daylight loft with cyclorama.",
        suggestedAmenities: ["cyclorama", "makeup table"],
        suggestedRules: ["No smoking"],
        suggestedRooms: [],
      }),
    },
  });

  const draft = await service.createDraftFromText({
    source: "web",
    text: "Loft in Karlin, daylight, cyclorama, makeup table.",
  });

  expect(draft.status).toBe("draft_ready");
  expect(draft.studioName).toBe("Loft Karlin");
  expect(draft.missingFields).toContain("price");
});
```

- [ ] Implement `apps/api/src/ownerOnboarding.ts`.

Public API:

```ts
export function createOwnerOnboardingService(deps: OwnerOnboardingDeps): OwnerOnboardingService;

export interface OwnerOnboardingService {
  createDraftFromText(input: CreateDraftFromTextInput): Promise<OwnerOnboardingDraft>;
  appendText(input: AppendTextInput): Promise<OwnerOnboardingDraft>;
  attachMedia(input: AttachMediaInput): Promise<OwnerOnboardingDraft>;
  regenerateDraft(input: RegenerateDraftInput): Promise<OwnerOnboardingDraft>;
  publishDraft(input: PublishDraftInput): Promise<PublishedStudioListing>;
}
```

- [ ] Add API endpoints.

```text
POST /api/owner/onboarding/start
POST /api/owner/onboarding/:draftId/messages
GET  /api/owner/onboarding/:draftId
POST /api/owner/onboarding/:draftId/regenerate
POST /api/owner/onboarding/:draftId/publish
```

- [ ] Rules:

```text
The first submitted text can create an anonymous owner draft.
Media can attach before email verification.
Publish requires verified email.
Draft response includes missingFields for UI guidance.
AI failures return a usable draft with raw text and missingFields instead of blocking upload.
```

- [ ] Run:

```powershell
npm test
npm run typecheck
```

- [ ] Commit:

```powershell
git add packages/shared/src/types.ts packages/shared/src/index.ts apps/api/src/ownerOnboarding.ts apps/api/src/ownerOnboarding.test.ts apps/api/src/server.ts apps/api/src/server.test.ts
git commit -m "feat: add shared owner onboarding drafts"
git push origin main
```

---

## Phase 6: Web Owner Chat Drawer And One-Click Entry

**Purpose:** A studio owner can open the website, click one owner CTA, drop text and photos, receive a polished draft, then verify email.

- [ ] Extend `apps/web/src/api.ts`.

Functions:

```ts
export async function startOwnerOnboarding(input: { text: string; source: "web" }): Promise<OwnerOnboardingDraft>;
export async function sendOwnerOnboardingMessage(draftId: string, input: { text: string }): Promise<OwnerOnboardingDraft>;
export async function uploadOwnerMedia(input: { draftId: string; file: File; ownerSessionToken?: string }): Promise<OwnerMedia>;
export async function requestOwnerEmailCode(input: { draftId: string; email: string }): Promise<{ ok: true; email: string }>;
export async function verifyOwnerEmailCode(input: { email: string; code: string }): Promise<OwnerSession>;
export async function publishOwnerDraft(input: { draftId: string; ownerSessionToken: string }): Promise<PublishedStudioListing>;
```

- [ ] Add failing web tests in `apps/web/src/App.test.tsx`.

Tests:

```tsx
it("opens owner onboarding from the floating studio CTA", async () => {
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: /list your studio/i }));
  expect(screen.getByRole("dialog", { name: /create your studio profile/i })).toBeInTheDocument();
});

it("lets an owner send text, attach photos, then asks for email after draft generation", async () => {
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: /list your studio/i }));
  await userEvent.type(screen.getByLabelText(/studio description/i), "Karlin daylight loft with cyclorama");
  await userEvent.upload(screen.getByLabelText(/add photos/i), new File(["x"], "room.jpg", { type: "image/jpeg" }));
  await userEvent.click(screen.getByRole("button", { name: /create draft/i }));
  expect(await screen.findByText(/Loft Karlin/i)).toBeInTheDocument();
  expect(screen.getByText(/email helps you keep access/i)).toBeInTheDocument();
});
```

- [ ] Implement UI in `apps/web/src/App.tsx`.

Components can stay inside `App.tsx` for this iteration:

```text
OwnerLaunchButton
OwnerOnboardingDrawer
OwnerChatThread
OwnerMediaDropzone
OwnerDraftPreview
OwnerEmailVerificationStep
```

- [ ] UI behavior:

```text
Always-visible owner CTA, separate from Support.
Drawer feels like chat, with text input and photo upload.
Owner can submit photos before email.
Draft preview shows title, city, description, rooms, props, light, amenities, and missing fields.
Email step copy: "Email helps you keep access to this draft from the web, even if you started in Telegram. No password."
OTP input is exactly 6 digits.
Publish button disabled until email is verified.
```

- [ ] Add responsive CSS in `apps/web/src/styles.css`.

Layout rules:

```text
Mobile-first drawer.
No nested cards.
Photo thumbnails use fixed aspect ratio.
Buttons keep text inside on narrow screens.
Owner CTA never covers bottom navigation actions.
```

- [ ] Run:

```powershell
npm test
npm run typecheck
npm run build
```

- [ ] Use Browser to verify:

```text
http://localhost:5173/#profile
```

Checks:

```text
Owner CTA visible.
Drawer opens on mobile and desktop widths.
Photo upload preview appears.
Draft state shows email verification step.
Support float still works separately.
No overlapping text or controls.
```

- [ ] Commit:

```powershell
git add apps/web/src/api.ts apps/web/src/App.tsx apps/web/src/App.test.tsx apps/web/src/styles.css
git commit -m "feat: add web owner onboarding chat"
git push origin main
```

---

## Phase 7: Telegram Owner Intake With Real Photos

**Purpose:** Telegram becomes the fastest owner intake path and feeds the same draft pipeline.

- [ ] Add Telegram tests in `apps/api/src/telegram.test.ts`.

Tests:

```ts
it("creates an owner draft from a telegram text message", async () => {
  const bot = createTelegramBotHandler({ services: testOwnerServices() });

  const result = await bot.handleUpdate({
    message: {
      message_id: 1,
      from: { id: 1001, first_name: "Anna", username: "anna_studio" },
      chat: { id: 1001, type: "private" },
      text: "Studio in Prague, daylight, paper backdrops, makeup table.",
    },
  });

  expect(result.messages[0].text).toContain("I started your studio draft");
});

it("downloads telegram photos and attaches them to the owner draft", async () => {
  const bot = createTelegramBotHandler({ services: testOwnerServices({ telegramFileBytes: Buffer.from("photo") }) });

  const result = await bot.handleUpdate({
    message: {
      message_id: 2,
      from: { id: 1001 },
      chat: { id: 1001, type: "private" },
      photo: [{ file_id: "file_small", file_unique_id: "u1", width: 320, height: 240, file_size: 100 }],
    },
  });

  expect(result.messages[0].text).toContain("photo added");
});
```

- [ ] Refactor `apps/api/src/telegram.ts`.

Public handler:

```ts
export function createTelegramBotHandler(deps: TelegramBotDeps): TelegramBotHandler;
```

- [ ] Implement Telegram commands.

```text
/start
/draft
/publish
/email
```

- [ ] Telegram behavior:

```text
Text starts or updates a draft.
Photos download through Telegram getFile and store in R2.
Bot replies with draft summary and asks for more missing details.
After first AI draft, bot asks for email as backup web access.
Email verification can complete through a 6-digit code in Telegram or the web drawer.
Publish requires verified email.
```

- [ ] Add webhook endpoint.

```text
POST /api/telegram/webhook
```

- [ ] Add setup docs in `README.md`.

Include:

```powershell
$env:TELEGRAM_BOT_TOKEN="..."
curl "https://api.telegram.org/bot$env:TELEGRAM_BOT_TOKEN/setWebhook?url=https://your-domain.com/api/telegram/webhook"
```

- [ ] Run:

```powershell
npm test
npm run typecheck
```

- [ ] Commit:

```powershell
git add apps/api/src/telegram.ts apps/api/src/telegram.test.ts apps/api/src/server.ts apps/api/src/server.test.ts README.md
git commit -m "feat: add telegram owner onboarding"
git push origin main
```

---

## Phase 8: Manual Payment Booking Mode

**Purpose:** Soft launch supports real booking interest without platform payment.

- [ ] Create `apps/api/src/paymentMode.ts`.

API:

```ts
export type PaymentMode = "manual_at_studio" | "platform_payment";

export function getPaymentMode(input: { manualPaymentMode: boolean }): PaymentMode;
export function getPaymentInstructions(mode: PaymentMode): string;
```

- [ ] Add tests:

```ts
it("uses direct studio payment copy during soft launch", () => {
  expect(getPaymentMode({ manualPaymentMode: true })).toBe("manual_at_studio");
  expect(getPaymentInstructions("manual_at_studio")).toContain("pay the studio directly");
});
```

- [ ] Update booking API responses.

Expected booking payload includes:

```json
{
  "paymentMode": "manual_at_studio",
  "paymentInstructions": "No online payment is taken yet. Pay the studio directly according to the booking terms.",
  "price": {
    "amount": 850,
    "currency": "CZK",
    "unit": "hour"
  }
}
```

- [ ] Update web booking UI.

Rules:

```text
Show price clearly.
Do not show card entry.
Do not use wording that implies platform payment.
Confirmation copy says request/reservation is sent and payment is direct.
Keep future platform payment fields out of visible UI while MANUAL_PAYMENT_MODE=true.
```

- [ ] Update tests in `apps/web/src/App.test.tsx` and `apps/api/src/server.test.ts`.

- [ ] Run:

```powershell
npm test
npm run typecheck
npm run build
```

- [ ] Browser verification:

```text
Booking path shows direct payment copy.
No checkout/payment field is visible.
Existing booking messages still work.
```

- [ ] Commit:

```powershell
git add apps/api/src/paymentMode.ts apps/api/src/server.ts apps/api/src/server.test.ts apps/web/src/App.tsx apps/web/src/App.test.tsx apps/web/src/styles.css packages/shared/src/types.ts
git commit -m "feat: enable manual payment booking mode"
git push origin main
```

---

## Phase 9: Support, Data Protection, And Launch Guardrails

**Purpose:** Preserve the support learning loop and reduce easy data extraction risk for soft launch.

- [ ] Extend support context logging.

Support ticket payload should include:

```ts
{
  userRole: "client" | "photographer" | "owner" | "unknown";
  currentView: string;
  currentStudioId?: string;
  currentDraftId?: string;
  sessionEvents: Array<{
    name: string;
    at: string;
    metadata?: Record<string, string | number | boolean>;
  }>;
}
```

- [ ] Add AI-ready internal categorization fields.

```text
category: feature_request | bug_report | listing_quality | booking_issue | owner_onboarding | other
priority: low | medium | high
```

- [ ] Protect public listing/media responses.

Rules:

```text
Paginate explore results.
Do not expose owner email or Telegram ids.
Return public media URLs only for published listings.
Do not return storage keys to the web.
Add basic rate limits for owner onboarding and support endpoints.
Keep robots policy conservative until launch content is reviewed.
```

- [ ] Add tests for redaction.

```ts
it("does not expose owner identity fields in public listing responses", async () => {
  const response = await app.inject({ method: "GET", url: "/api/studios/studio-lumen-karlin" });
  const body = JSON.stringify(response.json());
  expect(body).not.toContain("@");
  expect(body).not.toContain("telegramUserId");
  expect(body).not.toContain("storageKey");
});
```

- [ ] Run:

```powershell
npm test
npm run typecheck
npm run build
```

- [ ] Commit:

```powershell
git add apps/api/src/server.ts apps/api/src/server.test.ts apps/web/src/App.tsx apps/web/src/App.test.tsx packages/shared/src/types.ts
git commit -m "feat: harden support and public listing data"
git push origin main
```

---

## Phase 10: Production Setup Documentation And Smoke Test

**Purpose:** Make the first real test run repeatable by the owner of the project.

- [ ] Update `README.md`.

Sections:

```text
Soft launch mode
Required env
Local PostgreSQL setup
Prisma setup
Cloudflare R2 setup
Resend setup
Telegram bot setup
Owner web-chat test script
Telegram owner onboarding test script
Manual payment limitations
```

- [ ] Add a launch checklist to README.

Checklist:

```text
DATABASE_URL filled
Resend domain verified
R2 bucket created
R2 public/custom domain configured
Telegram bot token added
Telegram webhook configured
OPENAI_API_KEY added
MANUAL_PAYMENT_MODE=true
Email OTP works
Web owner chat creates draft
Telegram owner flow creates draft with photos
Public listing hides owner private data
Booking path shows direct payment copy
```

- [ ] Run final verification.

Commands:

```powershell
npm test
npm run typecheck
npm run build
git status --short
```

- [ ] Browser smoke test:

```text
Open http://localhost:5173/
Open owner chat from the floating owner CTA.
Create a draft with text.
Attach a real local image.
See AI draft.
Enter email.
Enter 6-digit code from test output or Resend.
Publish draft.
Open explore view and verify listing appears without private owner fields.
Create a booking request and verify direct payment copy.
```

- [ ] Commit docs and final polish:

```powershell
git add README.md .env.example
git commit -m "docs: add soft launch setup guide"
git push origin main
```

---

## Implementation Order For The Next Work Sessions

Recommended batching for the user's preferred "2-3 points at a time" workflow:

1. Phase 1 + Phase 2: environment and persistence foundation.
2. Phase 3 + Phase 4: email OTP and R2 uploads.
3. Phase 5 + Phase 6: shared draft service and web owner chat.
4. Phase 7: Telegram onboarding.
5. Phase 8 + Phase 9: manual payment mode and data/support hardening.
6. Phase 10: production setup docs and full smoke test.

Each batch ends with:

```powershell
npm test
npm run typecheck
npm run build
git status --short
git add <changed files>
git commit -m "<scoped message>"
git push origin main
```

---

## Acceptance Criteria

- [ ] A studio owner can start from the website with one visible owner CTA.
- [ ] A studio owner can start from Telegram with text and photos.
- [ ] Real photos upload to S3-compatible storage and appear in draft/listing UI.
- [ ] The first AI draft is created before email is requested.
- [ ] Email is requested as backup access and verified with a 6-digit OTP.
- [ ] No password flow exists in v1.
- [ ] Returning owner can access draft/account through verified email code.
- [ ] Publish requires verified email.
- [ ] Booking shows price and direct-at-studio payment copy.
- [ ] No platform payment UI appears during `MANUAL_PAYMENT_MODE=true`.
- [ ] Public listing APIs do not expose owner email, Telegram ids, or storage keys.
- [ ] Support includes user role, current view, draft/listing context, and recent activity.
- [ ] README tells exactly where to put env keys and how to test Telegram/web onboarding.

