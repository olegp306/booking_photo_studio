import type { City, Studio } from "./types";

export const prague: City = {
  id: "prague",
  name: "Prague",
  countryCode: "CZ",
  currency: "CZK"
};

export const seedStudios: Studio[] = [
  {
    id: "studio-lumen-karlin",
    slug: "studio-lumen-karlin",
    name: "Studio Lumen Karlin",
    city: prague,
    district: "Karlin",
    addressHint: "Karlin, Prague 8",
    latitude: 50.0923,
    longitude: 14.4512,
    rating: 4.92,
    reviewCount: 128,
    priceFrom: 1300,
    currency: "CZK",
    bookingMode: "hybrid",
    ownerName: "Lumen Studios",
    listingStatus: "draft",
    tagline: "Bright daylight studio with cyclorama and soft neutral interiors.",
    description:
      "A flexible daylight studio for portraits, fashion editorials, content days, and small product shoots. The main room has large industrial windows, a white cyclorama, and included modifiers.",
    moodTags: ["daylight", "minimal", "editorial", "neutral"],
    shootTypes: ["portrait", "fashion", "beauty", "content", "product"],
    featureIds: ["natural-light", "cyclorama", "paper-backdrops", "product-table"],
    equipmentIds: ["strobes", "softboxes", "c-stands", "tripods"],
    amenityIds: ["makeup-station", "dressing-room", "elevator", "wifi"],
    props: ["white plinths", "linen sofa", "paper plants", "neutral stools"],
    accessNotes: "Elevator access from the courtyard. Freight lift available by request after 19:00.",
    cancellationPolicy: "Free cancellation until 48 hours before the booking.",
    images: [
      {
        id: "lumen-hero",
        url: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
        alt: "Bright neutral studio interior with large windows",
        kind: "hero"
      },
      {
        id: "lumen-cyc",
        url: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
        alt: "Open studio room with white walls",
        kind: "room"
      },
      {
        id: "lumen-example",
        url: "https://images.unsplash.com/photo-1512316609839-ce289d3eba0a?auto=format&fit=crop&w=1200&q=80",
        alt: "Editorial portrait example",
        kind: "example"
      }
    ],
    rooms: [
      {
        id: "lumen-main",
        name: "Main Daylight Room",
        summary: "Cyclorama, big windows, neutral walls, and room for a small team.",
        areaSqm: 92,
        ceilingHeightM: 4.1,
        capacity: 10,
        pricePerHour: 1300,
        bookingMode: "instant",
        featureIds: ["natural-light", "cyclorama", "paper-backdrops"],
        equipmentIds: ["strobes", "softboxes", "c-stands"],
        imageIds: ["lumen-cyc"]
      },
      {
        id: "lumen-product",
        name: "Product Corner",
        summary: "Tabletop setup with continuous light and clean surfaces.",
        areaSqm: 26,
        ceilingHeightM: 3.4,
        capacity: 4,
        pricePerHour: 700,
        bookingMode: "request",
        featureIds: ["product-table", "natural-light"],
        equipmentIds: ["continuous-lights", "tripods"],
        imageIds: ["lumen-example"]
      }
    ],
    rules: ["Minimum booking 2 hours", "No confetti", "Pets by request"]
  },
  {
    id: "atelier-rosa-vinohrady",
    slug: "atelier-rosa-vinohrady",
    name: "Atelier Rosa Vinohrady",
    city: prague,
    district: "Vinohrady",
    addressHint: "Vinohrady, Prague 2",
    latitude: 50.0755,
    longitude: 14.4378,
    rating: 4.86,
    reviewCount: 84,
    priceFrom: 950,
    currency: "CZK",
    bookingMode: "request",
    ownerName: "Atelier Rosa",
    listingStatus: "published",
    tagline: "Warm lifestyle apartment studio for portraits, maternity, and family shoots.",
    description:
      "A cozy apartment-like studio with bedroom and living-room sets, textured walls, soft daylight, and calm colors for client-friendly sessions.",
    moodTags: ["warm", "lifestyle", "soft", "home"],
    shootTypes: ["portrait", "family", "maternity", "boudoir", "content"],
    featureIds: ["natural-light", "textured-walls", "bedroom-set", "colored-walls"],
    equipmentIds: ["led-panels", "softboxes", "tripods"],
    amenityIds: ["makeup-station", "kitchen", "wifi", "pet-friendly"],
    props: ["linen bedding", "ceramic vases", "boucle chair", "soft curtains"],
    accessNotes: "Second-floor apartment studio with elevator. Shoes off in styled rooms.",
    cancellationPolicy: "Free cancellation until 72 hours before the booking.",
    images: [
      {
        id: "rosa-hero",
        url: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80",
        alt: "Warm apartment-like studio interior",
        kind: "hero"
      },
      {
        id: "rosa-bedroom",
        url: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80",
        alt: "Bedroom set with soft daylight",
        kind: "room"
      },
      {
        id: "rosa-example",
        url: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80",
        alt: "Soft portrait example",
        kind: "example"
      }
    ],
    rooms: [
      {
        id: "rosa-lifestyle",
        name: "Lifestyle Suite",
        summary: "Living-room and bedroom set with textured walls and soft daylight.",
        areaSqm: 64,
        ceilingHeightM: 3.2,
        capacity: 7,
        pricePerHour: 950,
        bookingMode: "request",
        featureIds: ["natural-light", "bedroom-set", "textured-walls"],
        equipmentIds: ["led-panels", "softboxes"],
        imageIds: ["rosa-bedroom"]
      }
    ],
    rules: ["Shoes off in bedroom set", "Pets allowed after approval", "No glitter"]
  },
  {
    id: "framehouse-smichov",
    slug: "framehouse-smichov",
    name: "Framehouse Smichov",
    city: prague,
    district: "Smichov",
    addressHint: "Smichov, Prague 5",
    latitude: 50.0718,
    longitude: 14.4031,
    rating: 4.78,
    reviewCount: 51,
    priceFrom: 1600,
    currency: "CZK",
    bookingMode: "instant",
    ownerName: "Framehouse",
    listingStatus: "published",
    tagline: "Production-ready studio with blackout, projector, smoke machine, and loading access.",
    description:
      "A practical studio for commercial photo and video production, with controlled light, production equipment, and easy load-in.",
    moodTags: ["production", "dark", "video", "commercial"],
    shootTypes: ["fashion", "product", "ecommerce", "video", "corporate"],
    featureIds: ["blackout", "paper-backdrops", "product-table"],
    equipmentIds: ["strobes", "continuous-lights", "c-stands", "smoke-machine", "projector"],
    amenityIds: ["parking", "ground-floor", "wifi", "air-conditioning", "dressing-room"],
    props: ["black plinths", "projector screen", "rolling flats", "industrial stools"],
    accessNotes: "Ground-floor loading bay with one reserved van spot behind the building.",
    cancellationPolicy: "Free cancellation until 48 hours before the booking; overtime is billed per started hour.",
    images: [
      {
        id: "frame-hero",
        url: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80",
        alt: "Production studio with dark walls and equipment",
        kind: "hero"
      },
      {
        id: "frame-room",
        url: "https://images.unsplash.com/photo-1497366412874-3415097a27e7?auto=format&fit=crop&w=1200&q=80",
        alt: "Large production room",
        kind: "room"
      },
      {
        id: "frame-example",
        url: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=80",
        alt: "Fashion shoot example",
        kind: "example"
      }
    ],
    rooms: [
      {
        id: "frame-blackout",
        name: "Blackout Hall",
        summary: "Controlled-light hall with equipment and loading access.",
        areaSqm: 118,
        ceilingHeightM: 4.8,
        capacity: 14,
        pricePerHour: 1600,
        bookingMode: "instant",
        featureIds: ["blackout", "paper-backdrops", "product-table"],
        equipmentIds: ["strobes", "continuous-lights", "c-stands", "smoke-machine"],
        imageIds: ["frame-room"]
      }
    ],
    rules: ["Minimum booking 3 hours", "Smoke machine must be requested", "Overtime billed per started hour"]
  }
];
