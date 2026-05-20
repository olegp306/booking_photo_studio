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
- Owner inbox for approving and declining booking requests.
- Customer bookings view with payment CTA placeholder.
- Saved studios shortlist for comparing and sharing candidates.
- Shareable studio detail links for client-photographer handoff.
- Shareable saved shortlists for sending several studio options at once.
- Collaborative shortlist decisions and notes for client-photographer review.
- Persisted shared shortlist resources with short `#shortlist/<id>` links.
- Persisted shortlist decision and note updates on shared links.
- Owner listing editor with AI-ready draft generation from voice or text notes.
- Owner media organizer for categorizing listing images as hero, rooms, examples, equipment, and props.

## Project Docs

- [Product spec](./specs/2026-05-19-photo-studio-marketplace-design.md)
- [Marketplace foundation plan](./plans/2026-05-19-marketplace-foundation.md)
- [Availability and booking plan](./plans/2026-05-19-availability-booking.md)

## Next Roadmap

1. Replace in-memory booking state with persistent storage.
2. Add authentication and role-aware sessions for customers, photographers, studio owners, and admins.
3. Integrate real payments with Stripe Checkout and a future owner payout model.
4. Expand the owner listing editor for rooms, equipment, props, rules, pricing, and image upload.
5. Connect the AI listing assistant to voice input and OpenAI so owners can generate structured listings from spoken notes.
6. Add AI media helper flows to classify uploaded images as hero, room, example, equipment, or props.
7. Add owner calendar management, blocked time, and availability overrides.
8. Add authentication and durable database storage for shared shortlists, comments, and decisions.
9. Add post-booking lifecycle: messages, confirmations, reviews, and receipts.
10. Add AI matching later as a guided search layer for shoot mood, light, interiors, and equipment needs.
