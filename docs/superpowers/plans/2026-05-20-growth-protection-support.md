# Growth, Protection, and Support Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first product growth, marketplace protection, and support intelligence layer so the app can collect user feedback with context, track share/referral sources, and reduce easy data scraping.

**Architecture:** Keep v1 pragmatic: extend shared types, add local JSON-backed API stores, wire lightweight frontend tracking, and expose support/referral context in the mobile UI. Use existing Fastify, React, TypeScript, and `LOCAL_DATA_DIR` persistence patterns instead of adding a new database or third-party support tool yet.

**Tech Stack:** React/Vite, Node.js/Fastify, TypeScript, Vitest, Testing Library, shared TypeScript package, local JSON stores through `createJsonResourceStore`.

---

## Product Questions To Resolve Before Execution

Resolved in the May 20 support pass:
- Support entry is an always-visible floating `Help` button.
- User-facing support is free text; `SupportCategory` remains internal for later AI triage.
- Recent activity is included by default with a visible checkbox.
- Host dashboard includes a Support Inbox preview for v1.
- Referral tracking and public/private data protection remain the next implementation block.

1. **Support entry point:** Should the button be always visible as a floating `Help` button, or placed inside the top account/session block?
   - Recommended: floating `Help` button, because support must be available at the moment of confusion.

2. **Support categories:** Should v1 categories be user-facing simple labels or internal operational labels?
   - Recommended: simple user-facing labels with stable internal values: `booking_issue`, `studio_info_wrong`, `payment`, `owner_listing`, `idea`, `bug`.

3. **Consent default:** Should “include recent activity” be on by default?
   - Recommended: yes, on by default, with clear short text.

4. **Support visibility:** Who should see support inbox in v1?
   - Recommended: expose an internal API endpoint and a Host/Launch section preview for now; later create admin role dashboard.

5. **Marketing/referral:** Which first tracking source matters most?
   - Recommended: track `ref` query/hash source from shared links, starting with photographer and Telegram sources.

6. **Marketplace protection posture:** Do we want strict contact hiding immediately?
   - Recommended: v1 hides direct studio contact fields from public API entirely because contact exchange is not yet modeled.

7. **Scraping friction:** Should we add hard rate limits now?
   - Recommended: add lightweight request counters and public API field shaping now; production rate limiting can come later with infra support.

---

## File Structure

- Modify `packages/shared/src/types.ts`
  - Add `SupportTicket`, `SupportCategory`, `SupportEvent`, `ReferralSource`, and public studio summary types.
- Modify `apps/api/src/server.ts`
  - Add support ticket endpoints, public-safe studio response shaping, referral capture endpoint, and basic public API request metadata.
- Modify `apps/api/src/server.test.ts`
  - Add red/green tests for support ticket persistence, context payloads, referral capture, and public-safe studio data.
- Modify `apps/web/src/api.ts`
  - Add `createSupportTicket`, `loadSupportTickets`, `trackReferralSource`, and local fallback support state.
- Modify `apps/web/src/App.tsx`
  - Add client event logging, support drawer, support submission, and referral detection.
- Modify `apps/web/src/App.test.tsx`
  - Add user flow tests for opening support, submitting feedback with recent context, and referral detection from URL.
- Modify `apps/web/src/styles.css`
  - Add mobile support drawer and floating support button styles.
- Modify `projects/photo-studio-marketplace/README.md`
  - Document support intelligence, growth/referral tracking, and public/private data protection posture.

---

### Task 1: Shared Support And Referral Types

**Files:**
- Modify: `packages/shared/src/types.ts`

- [x] **Step 1: Write the failing type-driven tests indirectly**

Add API and web tests in later tasks that import these types through `@studio-market/shared`. This codebase does not currently have standalone type assertion tests, so the failing signal is TypeScript compilation after consumer tests reference missing types.

- [x] **Step 2: Add shared support and referral types**

Add after `UserSession`:

```ts
export type SupportCategory =
  | "booking_issue"
  | "studio_info_wrong"
  | "payment"
  | "owner_listing"
  | "idea"
  | "bug";

export interface SupportEvent {
  id: string;
  type: string;
  label: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | undefined>;
}

export interface SupportTicket {
  id: string;
  category: SupportCategory;
  message: string;
  includeActivity: boolean;
  session: UserSession;
  screen: string;
  relatedStudioSlug?: string;
  relatedBookingId?: string;
  relatedShortlistId?: string;
  events: SupportEvent[];
  userAgent?: string;
  createdAt: string;
}

export type ReferralSource = "telegram" | "photographer" | "studio_owner" | "direct" | "unknown";

export interface ReferralRecord {
  id: string;
  source: ReferralSource;
  path: string;
  session: UserSession;
  createdAt: string;
}
```

- [x] **Step 3: Verify shared package typecheck**

Run: `npm run typecheck -w packages/shared`

Expected: PASS after consumers are updated, or compile errors only where new types are not yet wired.

---

### Task 2: Support Ticket API With Local Persistence

**Files:**
- Modify: `apps/api/src/server.test.ts`
- Modify: `apps/api/src/server.ts`

- [x] **Step 1: Write failing API test for ticket creation**

Add to `apps/api/src/server.test.ts`:

```ts
it("creates support tickets with session and recent activity context", async () => {
  const server = buildServer();

  const response = await server.inject({
    method: "POST",
    url: "/support/tickets",
    payload: {
      category: "booking_issue",
      message: "I cannot tell whether the slot is confirmed.",
      includeActivity: true,
      screen: "#studio/studio-lumen-karlin",
      relatedStudioSlug: "studio-lumen-karlin",
      events: [
        {
          id: "event-1",
          type: "open_studio",
          label: "Opened Studio Lumen Karlin",
          createdAt: "2026-05-20T10:00:00.000Z",
          metadata: {
            studioSlug: "studio-lumen-karlin"
          }
        }
      ],
      userAgent: "vitest"
    }
  });

  expect(response.statusCode).toBe(201);
  expect(response.json().ticket).toEqual(
    expect.objectContaining({
      id: "support-ticket-1",
      category: "booking_issue",
      message: "I cannot tell whether the slot is confirmed.",
      includeActivity: true,
      screen: "#studio/studio-lumen-karlin",
      relatedStudioSlug: "studio-lumen-karlin",
      session: expect.objectContaining({
        role: "photographer"
      }),
      events: expect.arrayContaining([
        expect.objectContaining({
          type: "open_studio"
        })
      ])
    })
  );
});
```

- [x] **Step 2: Write failing API persistence test**

Add:

```ts
it("persists support tickets across API restarts", async () => {
  const localDataDir = mkdtempSync(join(tmpdir(), "studio-support-"));
  const server = buildServer({
    config: {
      localDataDir
    }
  });

  await server.inject({
    method: "POST",
    url: "/support/tickets",
    payload: {
      category: "idea",
      message: "Let photographers save a shortlist template.",
      includeActivity: false,
      screen: "#saved",
      events: []
    }
  });

  const restartedServer = buildServer({
    config: {
      localDataDir
    }
  });
  const response = await restartedServer.inject({
    method: "GET",
    url: "/support/tickets"
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().tickets).toEqual([
    expect.objectContaining({
      id: "support-ticket-1",
      category: "idea",
      message: "Let photographers save a shortlist template."
    })
  ]);
});
```

- [x] **Step 3: Run tests to verify RED**

Run: `npm run test -w apps/api -- src/server.test.ts -t "support tickets"`

Expected: FAIL with 404 for `/support/tickets`.

- [x] **Step 4: Implement API support store and validation**

In `apps/api/src/server.ts`, import types:

```ts
type SupportCategory,
type SupportEvent,
type SupportTicket
```

Add constants near session roles:

```ts
const supportCategories: SupportCategory[] = [
  "booking_issue",
  "studio_info_wrong",
  "payment",
  "owner_listing",
  "idea",
  "bug"
];

const isSupportCategory = (category: unknown): category is SupportCategory =>
  typeof category === "string" && supportCategories.includes(category as SupportCategory);
```

Inside `buildServer`, add:

```ts
const supportTicketStore = createJsonResourceStore<SupportTicket>(config.localDataDir, "support-tickets.json");
```

Add endpoints after `/session`:

```ts
app.post<{
  Body: {
    category?: unknown;
    message?: string;
    includeActivity?: boolean;
    screen?: string;
    relatedStudioSlug?: string;
    relatedBookingId?: string;
    relatedShortlistId?: string;
    events?: SupportEvent[];
    userAgent?: string;
  };
}>("/support/tickets", async (request, reply) => {
  if (!isSupportCategory(request.body.category)) {
    return reply.code(400).send({
      error: "INVALID_SUPPORT_CATEGORY",
      message: "Support category is required"
    });
  }

  const message = request.body.message?.trim();
  if (!message) {
    return reply.code(400).send({
      error: "INVALID_SUPPORT_MESSAGE",
      message: "Support message is required"
    });
  }

  const tickets = await supportTicketStore.list();
  const ticket: SupportTicket = {
    id: `support-ticket-${tickets.length + 1}`,
    category: request.body.category,
    message,
    includeActivity: request.body.includeActivity ?? true,
    session: (await sessionStore.list())[0] ?? defaultSession,
    screen: request.body.screen?.trim() || "unknown",
    relatedStudioSlug: request.body.relatedStudioSlug,
    relatedBookingId: request.body.relatedBookingId,
    relatedShortlistId: request.body.relatedShortlistId,
    events: request.body.includeActivity === false ? [] : request.body.events ?? [],
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
```

- [x] **Step 5: Run API tests to verify GREEN**

Run: `npm run test -w apps/api -- src/server.test.ts -t "support tickets"`

Expected: PASS.

---

### Task 3: Frontend Event Log And Support Drawer

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

- [x] **Step 1: Write failing web support flow test**

Add to `apps/web/src/App.test.tsx`:

```ts
it("submits support feedback with recent activity context", async () => {
  const user = userEvent.setup();
  const supportRequests: Array<unknown> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("/support/tickets")) {
      supportRequests.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          ticket: {
            id: "support-ticket-1",
            category: "booking_issue",
            message: "I cannot tell if this slot is confirmed.",
            includeActivity: true,
            screen: "#studio/studio-lumen-karlin",
            session: {
              id: "demo-session",
              role: "photographer",
              displayName: "Marta Photographer"
            },
            events: [],
            createdAt: "2026-05-20T10:00:00.000Z"
          }
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }
    throw new Error("Use local fallback");
  });
  render(<App />);

  await user.click(await screen.findByRole("button", { name: "Open Studio Lumen Karlin" }));
  await user.click(screen.getByRole("button", { name: "Open support" }));
  await user.selectOptions(screen.getByLabelText("Support category"), "booking_issue");
  await user.type(screen.getByLabelText("Support message"), "I cannot tell if this slot is confirmed.");
  await user.click(screen.getByRole("button", { name: "Send support request" }));

  expect(await screen.findByText("Support request sent.")).toBeInTheDocument();
  expect(supportRequests[0]).toEqual(
    expect.objectContaining({
      category: "booking_issue",
      message: "I cannot tell if this slot is confirmed.",
      includeActivity: true,
      relatedStudioSlug: "studio-lumen-karlin",
      events: expect.arrayContaining([
        expect.objectContaining({
          type: "open_studio"
        })
      ])
    })
  );
});
```

- [x] **Step 2: Run web test to verify RED**

Run: `npm run test -w apps/web -- src/App.test.tsx -t "support feedback"`

Expected: FAIL because support UI and API helper do not exist.

- [x] **Step 3: Add API helpers**

In `apps/web/src/api.ts`, import `SupportTicket`, `SupportCategory`, `SupportEvent`.

Add:

```ts
export type { SupportCategory, SupportEvent, SupportTicket };

export interface SupportTicketRequest {
  category: SupportCategory;
  message: string;
  includeActivity: boolean;
  screen: string;
  relatedStudioSlug?: string;
  relatedBookingId?: string;
  relatedShortlistId?: string;
  events: SupportEvent[];
  userAgent?: string;
}

const localSupportTickets: SupportTicket[] = [];

export const createSupportTicket = async (request: SupportTicketRequest): Promise<SupportTicket> => {
  try {
    const response = await fetch(`${API_BASE}/support/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error("Failed to create support ticket");
    const payload = (await response.json()) as { ticket: SupportTicket };
    return payload.ticket;
  } catch {
    const ticket: SupportTicket = {
      id: `local-support-ticket-${localSupportTickets.length + 1}`,
      ...request,
      session: localSession,
      createdAt: new Date().toISOString()
    };
    localSupportTickets.unshift(ticket);
    return ticket;
  }
};
```

Update `resetLocalApiStateForTests`:

```ts
localSupportTickets.splice(0, localSupportTickets.length);
```

- [x] **Step 4: Add event tracking and support drawer to App**

In `apps/web/src/App.tsx`, add state:

```ts
const [supportOpen, setSupportOpen] = useState(false);
const [supportEvents, setSupportEvents] = useState<SupportEvent[]>([]);
```

Add helper:

```ts
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
```

In `openStudio`, call:

```ts
trackSupportEvent("open_studio", `Opened ${studio.name}`, {
  studioSlug: studio.slug
});
```

Render global support UI near the bottom of each main app branch or create a wrapper component:

```tsx
<SupportButton onOpen={() => setSupportOpen(true)} />
<SupportDrawer
  events={supportEvents}
  isOpen={supportOpen}
  onClose={() => setSupportOpen(false)}
  screen={window.location.hash || "#explore"}
  session={session}
  relatedStudioSlug={selectedStudio?.slug}
/>
```

Implement `SupportButton`:

```tsx
const SupportButton = ({ onOpen }: { onOpen: () => void }) => (
  <button className="support-fab" onClick={onOpen} type="button" aria-label="Open support">
    Help
  </button>
);
```

Implement `SupportDrawer` with category select, textarea, include activity checkbox, and submit status. Use `createSupportTicket`.

- [x] **Step 5: Add CSS**

Add to `apps/web/src/styles.css`:

```css
.support-fab {
  position: fixed;
  right: calc(50% - 242px);
  bottom: 104px;
  z-index: 20;
  border: 1px solid #191714;
  border-radius: 999px;
  background: #191714;
  color: #fff;
  padding: 10px 14px;
  font-weight: 800;
}

.support-drawer {
  position: fixed;
  left: 50%;
  right: auto;
  bottom: 0;
  z-index: 30;
  width: min(100%, 520px);
  transform: translateX(-50%);
  padding: 16px 18px 22px;
  border-top: 1px solid #eadfd2;
  background: #fff;
  box-shadow: 0 -18px 38px rgba(36, 26, 18, 0.18);
}
```

- [x] **Step 6: Run web support test to verify GREEN**

Run: `npm run test -w apps/web -- src/App.test.tsx -t "support feedback"`

Expected: PASS.

---

### Task 4: Referral Tracking For Marketing Attribution

**Files:**
- Modify: `apps/api/src/server.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Write failing API referral test**

Add:

```ts
it("captures referral source visits", async () => {
  const server = buildServer();

  const response = await server.inject({
    method: "POST",
    url: "/referrals",
    payload: {
      source: "photographer",
      path: "#studio/studio-lumen-karlin"
    }
  });

  expect(response.statusCode).toBe(201);
  expect(response.json().referral).toEqual(
    expect.objectContaining({
      id: "referral-1",
      source: "photographer",
      path: "#studio/studio-lumen-karlin",
      session: expect.objectContaining({
        role: "photographer"
      })
    })
  );
});
```

- [ ] **Step 2: Add API implementation**

In `apps/api/src/server.ts`, import `ReferralRecord`, `ReferralSource`.

Add:

```ts
const referralSources: ReferralSource[] = ["telegram", "photographer", "studio_owner", "direct", "unknown"];
const isReferralSource = (source: unknown): source is ReferralSource =>
  typeof source === "string" && referralSources.includes(source as ReferralSource);
```

Inside `buildServer`:

```ts
const referralStore = createJsonResourceStore<ReferralRecord>(config.localDataDir, "referrals.json");
```

Endpoint:

```ts
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
```

- [ ] **Step 3: Add frontend referral detection**

In `apps/web/src/api.ts`, add:

```ts
export const trackReferralSource = async (source: ReferralSource, path: string): Promise<void> => {
  try {
    await fetch(`${API_BASE}/referrals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ source, path })
    });
  } catch {
    return undefined;
  }
};
```

In `App.tsx`, add:

```ts
const referralSourceFromLocation = (): ReferralSource | undefined => {
  const params = new URLSearchParams(window.location.search);
  const source = params.get("ref");
  return source === "telegram" || source === "photographer" || source === "studio_owner" ? source : undefined;
};
```

In `App`, add effect:

```ts
useEffect(() => {
  const source = referralSourceFromLocation();
  if (source) {
    trackReferralSource(source, `${window.location.search}${window.location.hash}`);
  }
}, []);
```

- [ ] **Step 4: Verify targeted tests**

Run:

```bash
npm run test -w apps/api -- src/server.test.ts -t "referral source"
npm run test -w apps/web -- src/App.test.tsx -t "referral"
```

Expected: PASS.

---

### Task 5: Public/Private Marketplace Protection

**Files:**
- Modify: `apps/api/src/server.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `projects/photo-studio-marketplace/README.md`

- [ ] **Step 1: Write failing public-safe studio API test**

Add:

```ts
it("returns public-safe studio fields without owner operational context", async () => {
  const server = buildServer();

  const response = await server.inject({
    method: "GET",
    url: "/public/studios/studio-lumen-karlin"
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().studio).toEqual(
    expect.objectContaining({
      slug: "studio-lumen-karlin",
      name: "Studio Lumen Karlin",
      images: expect.any(Array),
      rooms: expect.any(Array)
    })
  );
  expect(JSON.stringify(response.json().studio)).not.toContain("accessNotes");
  expect(JSON.stringify(response.json().studio)).not.toContain("cancellationPolicy");
});
```

- [ ] **Step 2: Implement public-safe endpoint**

In `apps/api/src/server.ts`, add helper:

```ts
const toPublicStudio = (studio: (typeof studios)[number]) => ({
  id: studio.id,
  slug: studio.slug,
  name: studio.name,
  cityId: studio.cityId,
  neighbourhood: studio.neighbourhood,
  tagline: studio.tagline,
  description: studio.description,
  priceFrom: studio.priceFrom,
  currency: studio.currency,
  rating: studio.rating,
  reviewCount: studio.reviewCount,
  bookingMode: studio.bookingMode,
  moodTags: studio.moodTags,
  shootTypes: studio.shootTypes,
  featureIds: studio.featureIds,
  equipmentIds: studio.equipmentIds,
  amenityIds: studio.amenityIds,
  images: studio.images,
  rooms: studio.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    summary: room.summary,
    areaSqm: room.areaSqm,
    ceilingHeightM: room.ceilingHeightM,
    capacity: room.capacity,
    pricePerHour: room.pricePerHour,
    bookingMode: room.bookingMode,
    featureIds: room.featureIds,
    equipmentIds: room.equipmentIds,
    imageIds: room.imageIds
  })),
  props: studio.props,
  rules: studio.rules
});
```

Endpoint:

```ts
app.get<{ Params: { slug: string } }>("/public/studios/:slug", async (request, reply) => {
  const studio = findStudioBySlug(studios, request.params.slug);
  if (!studio) {
    return reply.code(404).send({
      error: "STUDIO_NOT_FOUND",
      message: "Studio was not found"
    });
  }

  return {
    studio: toPublicStudio(studio)
  };
});
```

- [ ] **Step 3: Document protection posture**

In README Current Build, add:

```md
- Public-safe studio responses keep owner operational fields out of marketplace-facing API payloads.
- Support and referral events provide product intelligence without exposing secrets or payment data.
```

In roadmap, keep:

```md
- Add production rate limiting, bot protection, and permission checks around owner/admin endpoints.
```

- [ ] **Step 4: Verify targeted API test**

Run: `npm run test -w apps/api -- src/server.test.ts -t "public-safe studio"`

Expected: PASS.

---

### Task 6: Full Verification And Commit

**Files:**
- All touched files.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Expected:
- Typecheck passes.
- All tests pass.
- Build passes.
- Diff check has no whitespace errors.

- [ ] **Step 2: Browser smoke**

Open `http://localhost:5173/?v=support-intelligence#explore`.

Verify:
- `Help` button is visible.
- Open Studio Lumen Karlin.
- Open support.
- Select `Booking issue`.
- Enter a message.
- Submit.
- See `Support request sent.`

- [ ] **Step 3: Commit and push**

Run:

```bash
git status --short --branch
git add packages/shared/src/types.ts apps/api/src/server.ts apps/api/src/server.test.ts apps/web/src/api.ts apps/web/src/App.tsx apps/web/src/App.test.tsx apps/web/src/styles.css projects/photo-studio-marketplace/README.md
git commit -m "feat: add support intelligence foundation"
git push origin main
```

Expected:
- Commit succeeds.
- Push updates `origin/main`.

---

## Self-Review

**Spec coverage:** The plan covers support UX, contextual event logging, support persistence, marketing attribution/referrals, and first marketplace protection step through public-safe studio responses.

**Placeholder scan:** No TODO/TBD placeholders remain. Each code-changing task includes concrete snippets and commands.

**Type consistency:** Shared type names match API and frontend plan names: `SupportTicket`, `SupportCategory`, `SupportEvent`, `ReferralSource`, `ReferralRecord`, `UserSession`.
