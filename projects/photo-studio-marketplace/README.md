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
- Owner listing editor with AI-ready draft generation from voice or text notes.
- Owner room editor for room descriptions, hourly pricing, and room-level booking mode.
- Owner room attribute editor for area, ceiling height, and capacity.
- Owner logistics editor for props, access notes, and cancellation policy.
- Owner listing moderation status with draft, in-review, and published states.
- Owner media organizer for categorizing listing images as hero, rooms, examples, equipment, and props.
- Room-specific media assignment with room thumbnails on studio detail pages.

## Project Docs

- [Product spec](./specs/2026-05-19-photo-studio-marketplace-design.md)
- [Marketplace foundation plan](./plans/2026-05-19-marketplace-foundation.md)
- [Availability and booking plan](./plans/2026-05-19-availability-booking.md)

## Next Roadmap

1. Replace in-memory booking state with persistent storage.
2. Add authentication and role-aware sessions for customers, photographers, studio owners, and admins.
3. Integrate production Stripe Checkout, webhooks, and a future owner payout model.
4. Expand the owner listing editor with real image upload and drag-friendly media ordering.
5. Connect the AI listing assistant to voice input and OpenAI so owners can generate structured listings from spoken notes.
6. Add AI media helper flows to classify uploaded images as hero, room, example, equipment, or props.
7. Expand owner calendar management with drag-friendly editing and database-backed calendar state.
8. Add authentication and durable database storage for shared shortlists, comments, and decisions.
9. Add post-booking lifecycle: messages, richer review display, and receipts.
10. Add AI matching later as a guided search layer for shoot mood, light, interiors, and equipment needs.
