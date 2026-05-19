# Marketplace Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working vertical slice of the photo-studio marketplace: typed domain model, seed catalog, API endpoints, and a mobile-first React discovery/listing UI.

**Architecture:** Use an npm workspaces monorepo with `apps/api`, `apps/web`, and `packages/shared`. The shared package owns domain types, filter definitions, seed data, and pure search functions so both backend and frontend use the same vocabulary.

**Tech Stack:** React, Vite, TypeScript, Node.js, Fastify, Vitest, Testing Library.

---

## Scope

This plan implements Phase 1 from the spec: marketplace foundation. It does not implement auth, payments, real owner dashboard persistence, or booking checkout yet. It creates the foundation those later phases will extend.

## File Structure

- `package.json`: npm workspace scripts.
- `tsconfig.base.json`: shared TypeScript defaults.
- `apps/api`: Fastify API for health, studio search, studio detail, and taxonomy filters.
- `apps/web`: mobile-first React app with search filters, studio cards, and studio detail view.
- `packages/shared`: domain types, taxonomy constants, seed studios, search helpers.

## Tasks

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`

- [ ] Create npm workspaces for API, web, and shared package.
- [ ] Add root scripts: `dev`, `dev:web`, `dev:api`, `build`, `test`, `typecheck`.
- [ ] Run `npm install`.

### Task 2: Shared Domain And Search

**Files:**
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/taxonomy.ts`
- Create: `packages/shared/src/seedStudios.ts`
- Create: `packages/shared/src/search.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/search.test.ts`

- [ ] Define domain types for cities, studios, rooms, media, booking mode, equipment, amenities, and search filters.
- [ ] Add Prague seed studios with multiple rooms, equipment, amenities, mood tags, and example images.
- [ ] Add pure `searchStudios(studios, filters)` helper.
- [ ] Test city, shoot type, equipment, amenity, and price filtering.

### Task 3: API Vertical Slice

**Files:**
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/server.test.ts`

- [ ] Add Fastify server factory.
- [ ] Add `GET /health`.
- [ ] Add `GET /studios`.
- [ ] Add `GET /studios/:slug`.
- [ ] Add `GET /taxonomy`.
- [ ] Test successful search and 404 detail behavior.

### Task 4: Mobile Web Discovery UI

**Files:**
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/api.ts`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/src/App.test.tsx`

- [ ] Build mobile-first Explore screen.
- [ ] Add Airbnb-like search bar, filter chips, horizontal category filters, cards, saved/share actions, and bottom nav.
- [ ] Add listing detail panel/page with hero gallery, room summary, equipment, amenities, booking mode, and CTA.
- [ ] Use shared seed fallback if API is unavailable during frontend-only development.
- [ ] Test that Prague studios render and filter chips narrow results.

### Task 5: Verification

**Commands:**
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run dev`

- [ ] Confirm typecheck passes.
- [ ] Confirm tests pass.
- [ ] Confirm production build passes.
- [ ] Start dev servers and open the web app in the browser.

