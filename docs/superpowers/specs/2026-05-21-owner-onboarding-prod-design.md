# Owner Onboarding And Soft Launch Payments Design

## Goal

Prepare the marketplace for a first production launch where studio owners can create real studio profiles through Telegram or the web, customers can request bookings with visible prices, and payment is handled directly between customer and studio on site. Platform payments, commissions, payouts, and refunds remain a later phase.

The launch target is a soft marketplace launch, not a fully automated payments marketplace. The product should make studio onboarding extremely easy while keeping account access recoverable and listing publication controlled.

## Current Baseline

The app already has:

- React/Vite mobile web app and Node/Fastify TypeScript API.
- Shared domain package.
- Studio catalog, detail pages, room/media/editor flows, saved shortlists, bookings, owner inbox, owner calendar, and support.
- AI listing draft endpoint with OpenAI fallback behavior.
- Telegram owner draft webhook foundation.
- Admin listing review queue foundation.
- Prototype role switching.
- Local JSON persistence through `LOCAL_DATA_DIR`.

The app does not yet have production authentication, PostgreSQL persistence, production media storage, email OTP, or a final no-platform-payment booking mode.

## Product Decisions

### Owner Entry

Use a hybrid entry model:

- Web entry: a visible `List your studio` CTA on the site.
- Telegram entry: a Telegram bot as the fastest owner onboarding path.

The web CTA opens an owner onboarding chat drawer. It should feel similar to the support drawer pattern, but it must be a separate product surface with its own copy, state, and actions. The owner chat is not support; it is a guided listing creation flow.

### Identity

Use passwordless owner identity for v1:

- Primary identity: Telegram account.
- Backup identity: email verified by a 6-digit one-time code.
- No passwords in v1.

Email is requested after the first AI-generated draft, not before upload. The copy should frame email as account recovery and draft protection:

> Save this draft to your account. Email lets you return later with a one-time code, no password needed.

The email code:

- Is 6 digits.
- Is sent via Resend.
- Expires after 10 minutes.
- Can be requested again with rate limits.
- Verifies and links the email to the owner account.

Owners can later sign in through Telegram or email OTP.

### Media

Real photos are accepted immediately in both channels:

- Web owner chat accepts file uploads.
- Telegram bot accepts Telegram photos/documents.

Use S3-compatible storage for production media, with Cloudflare R2 as the preferred v1 provider. The application should depend on a storage abstraction so AWS S3, R2, or another S3-compatible provider can be swapped by configuration.

Media records should store:

- Stable media id.
- Owner id.
- Draft id or listing id.
- Storage key.
- Public or signed URL strategy.
- Original filename when available.
- MIME type.
- Size.
- Source channel: `web` or `telegram`.
- Suggested category: hero, room, example, equipment.
- Optional room binding.
- Created timestamp.

Uploaded files must have file type and size validation before storage. Listings are only publicly visible after admin review.

### Data Foundation

Move production data to PostgreSQL with Prisma.

Initial data model areas:

- Users and owner profiles.
- Telegram identities.
- Email OTP challenges.
- Owner onboarding drafts.
- Listings and listing review state.
- Listing media.
- Rooms, props, amenities, features, rules, access notes, cancellation policy.
- Booking requests and owner decisions.
- Calendar blocks.
- Support tickets.
- Referral events.
- Public API metrics.

Local JSON stores can remain for development fallback during migration, but production must use the database.

### Booking Without Platform Payment

The first production booking model is request/confirm with direct payment:

- Customer sees studio price.
- Customer requests a date/time.
- Owner approves or declines.
- Approved booking shows clear copy: payment is handled directly with the studio on site.
- No Stripe checkout in the first production launch.
- No platform commission automation in the first production launch.

The UI should avoid saying "paid", "payment captured", or "receipt" for soft-launch bookings. It should use language like:

- `Request sent`
- `Approved by studio`
- `Confirmed - pay at studio`
- `Completed`

Receipts for platform payment should remain a later phase or be hidden while manual payment mode is active.

## User Flows

### Web Owner Onboarding Flow

1. Owner clicks `List your studio`.
2. Owner chat drawer opens.
3. Owner adds text and photos.
4. Backend uploads photos to R2 and creates media records.
5. Backend sends text and media hints to the AI draft flow.
6. App shows a first structured listing draft.
7. App asks for email to save the draft and enable passwordless return.
8. Owner enters email.
9. Backend sends 6-digit code through Resend.
10. Owner enters code.
11. Email is verified and linked to owner account.
12. Owner continues to listing editor.
13. Owner submits listing for review.
14. Admin approves the listing.
15. Listing becomes public.

### Telegram Owner Onboarding Flow

1. Owner starts the Telegram bot with `/start`.
2. Bot offers `Add studio`.
3. Owner sends studio description and photos.
4. Backend validates Telegram init/webhook data and links or creates a Telegram owner identity.
5. Backend uploads Telegram media to R2 and stores media records.
6. Backend creates AI listing draft.
7. Bot replies that the draft is ready and asks the owner to open the web dashboard.
8. Web dashboard requests email after showing the draft.
9. Owner verifies email with a 6-digit Resend code.
10. Owner edits, submits for review, and waits for admin approval.

### Returning Owner Flow

Telegram:

1. Owner opens bot or Telegram Mini App.
2. Backend validates Telegram identity.
3. Owner lands in dashboard.

Email:

1. Owner clicks `Sign in`.
2. Owner enters email.
3. Backend sends 6-digit code through Resend.
4. Owner enters code.
5. Owner lands in dashboard.

## Architecture

### Frontend

Add or evolve these surfaces:

- `List your studio` CTA in marketplace UI.
- Owner onboarding chat drawer.
- File upload UI in the owner chat.
- Draft preview step.
- Email capture step.
- OTP verification step.
- Existing owner listing editor as post-verification destination.
- Clear manual-payment booking copy.

The owner chat should be stateful and resumable. It should be able to continue after Telegram handoff, page refresh, or email verification.

### Backend

Add or evolve these API areas:

- Auth/session APIs for Telegram and email OTP.
- Owner account APIs.
- Draft creation APIs shared by web and Telegram.
- Media upload APIs with S3/R2 storage adapter.
- Listing review APIs using existing admin review foundation.
- Manual-payment booking mode APIs.

Telegram webhook validation must remain server-side. Telegram user id or init data must never be trusted directly from the client without verification.

### Storage

Use:

- PostgreSQL + Prisma for structured data.
- Cloudflare R2 for media files.
- Resend for email OTP.
- Existing OpenAI integration for draft parsing and media suggestions.

## Security And Abuse Controls

Minimum v1 controls:

- Validate Telegram init data or webhook secret server-side.
- Store email OTP as a hash, not plain text.
- Expire OTP after 10 minutes.
- Limit OTP attempts and resend frequency.
- Validate upload MIME type and size.
- Store files under non-guessable keys.
- Keep owner/admin endpoints protected by real session role checks.
- Keep published public listing payloads separate from owner operational fields.
- Keep support/referral/public metrics free of secrets and payment data.

## Error Handling

Important user-facing failures:

- Upload failed: allow retry without losing entered text.
- AI draft failed: keep uploaded media and offer local/manual draft fallback.
- Email code expired: offer resend.
- Wrong code: show remaining attempts.
- Telegram webhook failed: log internally and send a friendly retry message when possible.
- R2 unavailable: do not create a published listing with missing media records.

## Testing Strategy

API tests:

- Telegram owner identity creation and validation.
- Email OTP request, wrong code, expired code, valid verification.
- Draft creation from web text/photos.
- Draft creation from Telegram text/photos.
- R2 storage adapter with fake storage implementation.
- Manual-payment booking status flow.
- Admin approval of submitted listings.

Web tests:

- `List your studio` opens owner chat.
- Owner uploads photos and text.
- First draft appears.
- Email prompt appears after draft, not before.
- 6-digit code verification unlocks dashboard.
- Manual payment booking copy replaces payment capture copy.

Integration/smoke:

- Telegram webhook draft creation with fake Telegram payload.
- Browser smoke for owner chat, email verification screen, and launch review queue.

## Implementation Phases

### Phase 1: Production Foundation

- Add Prisma and PostgreSQL schema.
- Add production session/auth model.
- Keep local dev fallback only where useful.

### Phase 2: Email OTP And Owner Identity

- Add Resend integration.
- Add email OTP request and verification.
- Link verified email to owner profile.
- Add email OTP sign-in.

### Phase 3: R2 Media Upload

- Add S3-compatible storage adapter.
- Add upload endpoint.
- Add media records.
- Add upload UI in owner chat.

### Phase 4: Shared Draft Pipeline

- Create shared owner draft API for web and Telegram.
- Feed text and media hints into AI listing draft generation.
- Save draft to PostgreSQL.

### Phase 5: Web Owner Chat

- Add `List your studio` CTA.
- Add owner onboarding drawer.
- Add draft preview, email capture, OTP verification.
- Route verified owner to listing editor.

### Phase 6: Telegram Owner Flow

- Expand bot commands and replies.
- Accept photos/documents and text.
- Create drafts through the shared pipeline.
- Deep-link to web dashboard for verification and editing.

### Phase 7: Manual Payment Booking Mode

- Replace payment capture path in v1 production mode.
- Add `pay_at_studio` or manual payment status.
- Update customer and owner booking copy.

### Phase 8: Production Hardening

- Rate limits.
- Audit logs.
- Backups.
- Deployment documentation.
- Privacy and terms pages.
- Basic monitoring.

## Out Of Scope For First Production Launch

- Stripe Checkout.
- Platform commission automation.
- Owner payouts.
- Refund automation.
- Full legal contract flow.
- Passkeys.
- Native mobile apps.

## Implementation Defaults

Unless changed before implementation, use these defaults:

- Keep deployment provider-agnostic by using standard environment variables and a deployable Node build.
- Use Cloudflare R2 with public read URLs for published listing media and private object keys for unpublished drafts.
- Limit web uploads to 15 MB per image in v1.
- Limit Telegram media imports to Telegram photos and image documents that pass MIME and size validation.
- Use a verified sender on the product domain for Resend OTP emails.
- Publish a listing immediately after admin approval; no extra owner confirmation is required in v1.
