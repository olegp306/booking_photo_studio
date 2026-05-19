# Availability Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first hybrid availability and booking-request slice so a user can choose a studio room/time and create a booking intent.

**Architecture:** Keep booking logic in `packages/shared` as pure functions and types, expose it through Fastify endpoints, then connect the mobile studio detail page to those endpoints with a seed fallback. Bookings remain in memory for this slice; persistence, auth, payment capture, and owner approval UI come later.

**Tech Stack:** TypeScript, Vitest, Fastify, React Testing Library, React.

---

## Scope

This implements the first part of Phase 2 from the spec. It supports availability display and booking intent creation, but does not charge cards or persist bookings to a database.

## File Structure

- `packages/shared/src/booking.ts`: pure availability, quote, validation, and booking intent helpers.
- `packages/shared/src/booking.test.ts`: tests for instant vs request booking statuses and validation.
- `packages/shared/src/types.ts`: booking, availability, and request DTO types.
- `apps/api/src/server.ts`: endpoints for availability and booking requests.
- `apps/api/src/server.test.ts`: endpoint tests.
- `apps/web/src/App.tsx`: detail-page booking panel.
- `apps/web/src/api.ts`: availability and booking client functions.
- `apps/web/src/App.test.tsx`: UI tests for availability and request submission.

## Tasks

### Task 1: Shared Booking Domain

- [ ] Write failing tests for `getAvailabilityForStudio`, `createBookingIntent`, and invalid room validation.
- [ ] Add availability and booking types.
- [ ] Implement pure helpers.
- [ ] Run shared tests and confirm they pass.

### Task 2: API Endpoints

- [ ] Write failing API tests for `GET /studios/:slug/availability` and `POST /booking-requests`.
- [ ] Add API routes using shared helpers and an in-memory booking list.
- [ ] Run API tests and confirm they pass.

### Task 3: Mobile Booking Panel

- [ ] Write failing UI tests for visible slots and request submission.
- [ ] Add client functions for availability and booking creation.
- [ ] Add room/time selection and request form to the studio detail page.
- [ ] Run web tests and confirm they pass.

### Task 4: Verification

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Open `http://localhost:5173`, verify the detail page shows availability and submits a booking intent.

