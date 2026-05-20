# Photo Studio Marketplace

Mobile-first marketplace for discovering, saving, booking, and managing photo studio rentals in European cities.

The first product shape is intentionally close to familiar Airbnb marketplace patterns, but the visual and search emphasis is on interiors, shooting examples, light, equipment, props, rooms, and studio availability.

## Current Build

- React/Vite mobile web app.
- Node.js/Fastify TypeScript API.
- Shared TypeScript domain package.
- Prague seed catalog with studios, rooms, equipment, props, and photo examples.
- Explore feed with filters and studio detail views.
- Availability slots and request-to-book flow.
- Owner calendar holds for blocking and releasing public booking slots.
- Owner calendar full-day room closures and weekly recurring holds.
- Owner calendar availability overrides and summary counts for quick owner review.
- Owner calendar agenda grouped by day with next-week duplication for recurring changes.
- Owner calendar session persistence with agenda filters by room and action.
- Owner inbox for approving and declining booking requests.
- Customer bookings view with payment capture status that confirms approved bookings.
- Owner booking completion action after a confirmed shoot.
- Customer review flow for completed bookings with studio rating updates.
- Saved studios shortlist for comparing and sharing candidates.
- Shareable studio detail links for client-photographer handoff.
- Shareable saved shortlists for sending several studio options at once.
- Collaborative shortlist decisions and notes for client-photographer review.
- Persisted shared shortlist resources with short `#shortlist/<id>` links.
- Persisted shortlist decision and note updates on shared links.
- Booking requests, owner calendar blocks, and shared shortlists can persist to local JSON storage through `LOCAL_DATA_DIR`.
- Prototype role-aware session with client, photographer, and studio owner modes.
- Session role can persist to local JSON storage through `LOCAL_DATA_DIR`.
- Owner listing editor with AI-ready draft generation from voice or text notes.
- Owner room editor for room descriptions, hourly pricing, and room-level booking mode.
- Owner room attribute editor for area, ceiling height, and capacity.
- Owner logistics editor for props, access notes, and cancellation policy.
- Owner listing moderation status with draft, in-review, and published states.
- Admin-only listing review endpoints plus a Host launch review queue for approving submitted studios.
- Owner media organizer for categorizing listing images as hero, rooms, examples, equipment, and props.
- Room-specific media assignment with room thumbnails on studio detail pages.
- Owner media ordering controls with hero promotion for mobile-friendly gallery curation.
- Owner local media upload previews with filename-based captions.
- AI media detail suggestions for category and room assignment.
- AI media suggestions now call the backend image/caption analysis flow with OpenAI vision when `OPENAI_API_KEY` is set, and fall back locally when it is not.
- Customer booking receipts after payment capture.
- Review counts surfaced on studio cards and detail pages.
- Booking message threads shared between customers and studio owners.
- Receipt download preparation action from customer bookings.
- Always-visible support float with a lightweight support drawer that captures user text and recent activity context by default.
- Support tickets persist to local JSON storage through `LOCAL_DATA_DIR` and can be reviewed in the Host support inbox.
- Support messages are free text for users and get an internal v1 triage category for product review.
- Referral source visits can be captured from shared links such as `?ref=telegram` or `?ref=photographer`.
- Host launch view summarizes referral source totals and recent attributed paths.
- Public-safe studio responses keep owner operational fields out of marketplace-facing API payloads.
- Public studio detail requests write local access metrics for early scraping and demand monitoring.
- Launch readiness panel for OpenAI, Telegram owner bot, public app URL, and Stripe keys.
- API readiness endpoint plus AI listing draft and Telegram webhook stubs with local fallback behavior.
- OpenAI-backed listing draft generation through the Responses API when `OPENAI_API_KEY` is set.
- Telegram owner onboarding webhook that stores imported listing drafts and replies with an owner dashboard link.
- Owner listing editor import panel for applying Telegram drafts to the public studio profile.
- Imported Telegram owner drafts can persist to local JSON storage through `LOCAL_DATA_DIR`.
- Launch readiness can register the Telegram owner bot webhook from the UI when bot and public URL env values are present.
- Telegram Mini App draft inbox at `#telegram-drafts` for reviewing imported owner drafts on mobile.
- Telegram bot replies now deep-link owners into the draft inbox before opening the full listing editor.

## Local Launch Env

- Fill local secrets in `../../.env.local`; the committed template is `../../.env.example`.
- Required for the live Telegram and AI pass: `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, and `PUBLIC_APP_URL`.
- Optional but recommended for bot webhook hardening: `TELEGRAM_WEBHOOK_SECRET`.
- Optional local persistence path for imported owner drafts, booking requests, calendar blocks, shared shortlists, support tickets, referral events, public API metrics, and prototype sessions: `LOCAL_DATA_DIR`.
- Optional until production payments are wired: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `OPENAI_LISTING_MODEL`.

## Project Docs

- [Product spec](./specs/2026-05-19-photo-studio-marketplace-design.md)
- [Marketplace foundation plan](./plans/2026-05-19-marketplace-foundation.md)
- [Availability and booking plan](./plans/2026-05-19-availability-booking.md)

## Next Roadmap

1. Replace local JSON persistence with database-backed storage for bookings, calendar blocks, shortlists, and reviews.
2. Replace prototype role switching with authentication, account creation, and broader permission checks for customers, photographers, studio owners, and admins.
3. Expand the owner listing editor with production media storage and drag-and-drop media ordering.
4. Expand owner calendar management with drag-friendly editing and database-backed calendar state.
5. Add durable shared shortlist comments and role-aware decision history.
6. Integrate production Stripe Checkout, webhooks, and a future owner payout model.
7. Add post-booking lifecycle: durable messages, downloadable receipt files, and full review history.
8. Add AI matching later as a guided search layer for shoot mood, light, interiors, and equipment needs.
9. Add AI support triage that classifies free-text reports into bugs, feature ideas, listing issues, and booking friction.
10. Add public/private API shaping, rate limiting, and bot protection around marketplace and owner/admin endpoints.
