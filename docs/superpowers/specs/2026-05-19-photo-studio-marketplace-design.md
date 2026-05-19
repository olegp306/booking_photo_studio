# Photo Studio Marketplace

## 1. Product Summary

Mobile-first marketplace for discovering and booking photo studios in European cities. The product is similar to Airbnb in familiar marketplace patterns: searchable listings, rich listing pages, maps, filters, calendars, bookings, payments, reviews, favorites, and host tools. The subject matter is different: studios are selected not only by location and price, but by shoot requirements, interiors, lighting, equipment, props, rooms, and visual examples.

V1 launches with Prague as the first go-to-market city, while the data model and architecture support multiple European cities from the start.

## 2. Product Positioning

The product helps photographers and clients choose the right studio together.

Photographers use it to find a technically suitable studio for a specific shoot: date, time, light, background, equipment, props, ceiling height, number of rooms, rules, access, and price.

Clients use it to visually inspect interiors, understand the mood of a place, compare examples, and share studio options with a photographer.

Studio owners use it to publish and manage their studios, rooms, pricing, calendars, equipment, photos, example shoots, rules, bookings, and payouts.

## 3. V1 Goals

- Let users browse and search Prague photo studios on mobile.
- Make each studio page visually rich and shareable.
- Support professional photo-studio filters from V1.
- Support both instant booking and request-to-book.
- Support real online payments from V1.
- Give studio owners a self-service way to create and manage listings.
- Use a React, Node.js, and TypeScript stack across frontend and backend.
- Build the domain model so the same backend can later support React Native apps.

## 4. Non-Goals For V1

- Native iOS or Android app.
- AI-based studio matching in production.
- Full CRM for photographers.
- Complex production crew management.
- In-app chat as the primary booking mechanism.
- Marketplace-wide dynamic pricing automation.
- Deep accounting or tax automation beyond payment records and exportable transaction data.

## 5. Target Platforms

V1 is a mobile-first React web app, designed to open cleanly on phones from shared links. It should be PWA-ready, but installation is not required for the first release.

Future scope: React Native apps using the same backend API and domain model.

## 6. Primary Roles

### Photographer

Needs to quickly find studios that satisfy shoot requirements. Main needs:

- Search by city, date, time, and duration.
- Filter by equipment, props, room type, light, ceiling height, background, and price.
- Save and compare studios.
- Share a studio page with a client.
- Book or request a slot.
- Pay online.
- See booking details, access instructions, rules, and cancellation policy.

### Client

Needs to understand whether a studio fits the desired visual style and practical constraints. Main needs:

- Browse visually rich studio pages.
- Inspect room photos, interiors, example shoots, and mood tags.
- Share studio options with a photographer.
- Save favorites.
- Book directly if they are arranging the shoot themselves.

### Studio Owner

Needs to publish supply and manage bookings. Main needs:

- Create studio listings.
- Add rooms and room-specific attributes.
- Upload photos and example shoot galleries.
- Add equipment, props, amenities, rules, and access details.
- Configure pricing, availability, booking mode, cancellation policy, and deposits.
- Accept instant bookings or manually approve requests.
- Receive payouts through Stripe Connect.

### Admin

Needs operational control over the marketplace. Main needs:

- Review and moderate listings.
- Manage user accounts, studio owners, bookings, and disputes.
- View payment and refund status.
- Manage taxonomy values such as equipment types, props, shoot types, and amenities.

## 7. Core User Flows

### Search And Discovery

1. User opens the app on mobile.
2. User selects city, date, time, duration, and optional number of people.
3. User sees Airbnb-like listing cards and, where useful, a map.
4. User applies photo-studio-specific filters.
5. User opens studio detail pages.
6. User saves or shares promising options.

### Shared Studio Decision

1. Photographer finds a suitable studio.
2. Photographer shares studio link with client.
3. Client opens the mobile studio page without installing an app.
4. Client reviews interiors, rooms, example photos, amenities, and rules.
5. Client sends feedback externally or saves the studio.

The reverse flow is also supported: client discovers and shares a studio with a photographer.

### Instant Booking

1. User selects available studio or room slot.
2. System calculates total price, service fee, optional add-ons, and cancellation policy.
3. User pays online.
4. Booking is confirmed immediately.
5. Owner and guest receive confirmation.
6. Booking appears in owner calendar and user account.

### Request-To-Book

1. User selects desired date, time, duration, and optional shoot details.
2. User submits a request.
3. Owner approves or declines.
4. If approved, user pays online or a pre-authorized payment is captured, depending on payment configuration.
5. Booking becomes confirmed.

### Owner Listing Creation

1. Owner signs up and completes profile.
2. Owner creates studio.
3. Owner adds one or more rooms.
4. Owner uploads studio photos, room photos, and optional example shoot galleries.
5. Owner adds equipment, props, amenities, rules, access details, and location.
6. Owner configures price, availability, booking mode, cancellation policy, and payout account.
7. Listing is submitted for review or published depending on admin rules.

## 8. Search And Filters

V1 requires strong studio-specific filters. These are a core product differentiator.

### Basic Filters

- City
- Date
- Start time
- Duration
- Price range
- Number of people
- District or neighborhood
- Map area
- Instant booking availability

### Studio And Room Filters

- Number of rooms
- Room area
- Ceiling height
- Natural light
- Blackout possibility
- Cyclorama
- Paper backdrops
- Colored walls
- Textured walls
- Kitchen set
- Bedroom set
- Bathroom set
- Lifestyle interior
- Product table or product setup

### Equipment Filters

- Strobes
- Continuous lights
- LED panels
- Softboxes
- Umbrellas
- Reflectors
- C-stands
- Tripods
- Smoke machine
- Projector
- Audio or video equipment

### Amenities And Practical Filters

- Makeup station
- Dressing room
- Shower
- Kitchen
- Parking
- Elevator
- Ground floor access
- Loading access
- Pet-friendly
- Air conditioning
- Heating
- Wi-Fi

### Shoot Type Tags

- Portrait
- Fashion
- Beauty
- Family
- Maternity
- Product
- E-commerce
- Video
- Content creation
- Corporate
- Boudoir
- Wedding preparation

Future scope: natural-language AI matching. Example: "I need a bright studio for a maternity shoot with beige interiors, natural light, and a makeup station."

## 9. Listing Page Requirements

The studio page is the most important conversion surface. It should use familiar Airbnb-like trust patterns while emphasizing photography-specific visuals.

### Required Listing Content

- Studio name
- Hero gallery
- Location summary
- District and transport/access notes
- Rating and review summary
- Price from
- Booking mode
- Availability preview
- Rooms
- Equipment
- Props
- Amenities
- Rules
- Cancellation policy
- Owner profile
- Share action
- Save/favorite action

### Room Content

Each studio can have multiple rooms. Each room may have:

- Name
- Description
- Photos
- Area
- Ceiling height
- Capacity
- Light characteristics
- Equipment included
- Props included
- Room-specific price
- Room-specific availability
- Room-specific booking mode

### Visual Content

Listing pages should support:

- Studio photo galleries
- Room galleries
- Example shoot galleries
- Mood tags
- Optional photographer credit on example photos

## 10. Booking And Availability

Booking mode is hybrid. Owners can configure instant booking or request-to-book by studio, room, or rule.

### Availability

- Availability is stored as time slots or calendar rules.
- Owners can block dates and times.
- Owners can set minimum booking duration.
- Owners can set preparation buffer before or after bookings.
- Owners can set minimum notice before booking.
- Owners can set different rules for weekdays and weekends.

### Booking Statuses

- Draft
- Pending owner approval
- Awaiting payment
- Confirmed
- Declined
- Cancelled by guest
- Cancelled by owner
- Completed
- Refunded
- Disputed

### Request-To-Book Data

Request-to-book can include:

- Shoot type
- Number of people
- Short message
- Equipment needs
- Special requirements
- Commercial or private use

## 11. Payments

V1 includes real online payments.

### Payment Provider

Use Stripe for payment processing. Use Stripe Connect for studio-owner payouts.

### Payment Methods

- Card
- Apple Pay
- Google Pay

### Marketplace Fees

System should support:

- Studio base price
- Add-ons
- Cleaning or setup fee
- Platform service fee
- Discounts or promo codes in future scope
- Refunds

### Payment States

- Payment pending
- Payment authorized
- Payment captured
- Payment failed
- Payment refunded
- Payment partially refunded
- Payout pending
- Payout paid
- Payout failed

### Cancellation And Refunds

Each listing has a cancellation policy. V1 should support policy-driven refund calculations, even if the first implementation starts with a small set of predefined policies.

## 12. Owner Tools

Owner dashboard should include:

- Studio list
- Listing editor
- Room editor
- Photo and gallery management
- Equipment and props management
- Availability calendar
- Booking request inbox
- Upcoming bookings
- Payment and payout status
- Basic profile and payout onboarding

Owner tools can be less visually polished than the consumer mobile experience, but they must be usable and reliable.

## 13. Admin Tools

Admin interface should include:

- User management
- Owner management
- Listing review
- Booking overview
- Payment and refund overview
- Taxonomy management
- Basic moderation for photos and listing text

## 14. Technical Architecture

### Stack

- Frontend: React + TypeScript
- Backend: Node.js + TypeScript
- API: REST or tRPC-style typed API
- Database: PostgreSQL
- ORM: Prisma or equivalent TypeScript-friendly ORM
- Payments: Stripe + Stripe Connect
- Auth: email/password plus OAuth-ready design
- File storage: S3-compatible object storage
- Image processing: background resizing and thumbnails
- Deployment: container-ready backend and static/frontend hosting

### Frontend Applications

V1 can be structured as:

- Consumer mobile web app
- Owner dashboard
- Admin dashboard

These can live in one monorepo, sharing UI primitives, types, and API clients.

### Backend Modules

- Auth
- Users and roles
- Studios
- Rooms
- Media
- Search
- Availability
- Bookings
- Payments
- Reviews
- Favorites
- Sharing
- Admin

### API Design Principles

- Keep domain models separate from transport DTOs.
- Use typed request and response schemas.
- Validate all inputs server-side.
- Treat Stripe webhooks as authoritative for payment state changes.
- Avoid frontend-only booking or payment state transitions.

## 15. Data Model

Core entities:

- User
- UserRole
- OwnerProfile
- Studio
- StudioRoom
- StudioMedia
- ExampleShoot
- EquipmentItem
- PropItem
- Amenity
- StudioRule
- AvailabilityRule
- CalendarBlock
- Booking
- BookingRequest
- Payment
- Payout
- CancellationPolicy
- Review
- Favorite
- ShareToken
- City
- Country

Important relationships:

- Studio belongs to owner.
- Studio has many rooms.
- Room belongs to studio.
- Booking can target studio or specific room.
- Studio and room can have separate media.
- Studio can have many equipment items, props, amenities, and rules.
- Payment belongs to booking.
- Payout belongs to payment and owner.

## 16. UX Principles

- Mobile first.
- Airbnb-like interaction patterns where they reduce learning curve.
- Photography-specific visual emphasis where it improves decision-making.
- Share links must work for unauthenticated users.
- Booking and payment steps must be explicit and trustworthy.
- Filters should be powerful but not overwhelming on mobile.
- Listing pages should show the actual space clearly, not generic atmospheric imagery.

## 17. Suggested Navigation

Consumer mobile navigation:

- Explore
- Saved
- Trips or Bookings
- Inbox or Requests
- Profile

Owner navigation:

- Dashboard
- Listings
- Calendar
- Bookings
- Payments
- Profile

Admin navigation:

- Overview
- Users
- Studios
- Bookings
- Payments
- Taxonomy

## 18. Reviews And Trust

V1 should support basic reviews after completed bookings.

Review dimensions can include:

- Accuracy
- Cleanliness
- Equipment condition
- Communication
- Value

Trust content:

- Verified owner
- Verified payment
- Cancellation policy
- Studio rules
- Review count
- Recent reviews

## 19. Notifications

V1 should support email notifications. Optional future channels:

- SMS
- Push notifications
- WhatsApp-style messaging integrations

Notification events:

- Booking confirmed
- Booking request received
- Booking request approved
- Booking request declined
- Payment successful
- Payment failed
- Booking cancelled
- Refund issued
- Upcoming booking reminder

## 20. Security And Compliance

- Role-based access control.
- Server-side authorization checks for every owner and admin action.
- Stripe handles sensitive payment details.
- Uploaded media should be validated by type and size.
- Private owner payout data should not be exposed to consumers.
- GDPR-ready account and data deletion path should be considered because the target market is Europe.

## 21. MVP Delivery Phases

### Phase 1: Marketplace Foundation

- Auth
- Studio listings
- Rooms
- Media upload
- Basic search
- Listing pages
- Share links
- Favorites

### Phase 2: Availability And Booking

- Availability calendar
- Instant booking
- Request-to-book
- Booking statuses
- Owner booking management
- Email notifications

### Phase 3: Payments

- Stripe Checkout or Payment Element
- Stripe Connect onboarding
- Platform fees
- Refunds
- Payment webhooks
- Payout tracking

### Phase 4: Owner And Admin Operations

- Owner dashboard hardening
- Listing moderation
- Admin booking/payment overview
- Taxonomy management

### Phase 5: Polish And Launch

- Prague seed catalog
- SEO landing/search pages
- Mobile UX refinement
- Performance pass
- Analytics
- Error tracking

## 22. Future Scope

- AI studio matching from natural-language shoot descriptions.
- React Native apps.
- In-app collaboration between photographer and client.
- Advanced comparison boards.
- Packages with photographer + studio.
- Add-on rentals.
- Membership or subscription models for studios.
- Dynamic pricing.
- Multi-language content management.
- Advanced dispute handling.

## 23. Open Product Decisions

- Exact platform fee model: guest fee, owner commission, or both.
- Exact cancellation policies for V1.
- Whether bookings can target the whole studio, individual rooms, or both in the initial implementation.
- Whether example shoot galleries require photographer permission metadata.
- Whether public studio pages should expose exact address before booking or only approximate location.
- Whether request-to-book should authorize payment before owner approval or collect payment only after approval.

