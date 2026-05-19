import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  findStudioBySlug,
  searchStudios,
  seedStudios,
  taxonomy,
  type AmenityId,
  type BookingMode,
  type EquipmentId,
  type FeatureId,
  type ShootType,
  type StudioSearchFilters
} from "@studio-market/shared";

const toArray = <T extends string>(value: string | string[] | undefined): T[] | undefined => {
  if (!value) return undefined;
  const values = Array.isArray(value) ? value : value.split(",");
  return values.map((item) => item.trim()).filter(Boolean) as T[];
};

export const buildServer = () => {
  const app = Fastify({ logger: false });

  app.register(cors, {
    origin: true
  });

  app.get("/health", async () => ({
    ok: true,
    service: "studio-market-api"
  }));

  app.get<{
    Querystring: {
      cityId?: string;
      query?: string;
      maxPrice?: string;
      shootType?: ShootType;
      featureIds?: string;
      equipmentIds?: string;
      amenityIds?: string;
      bookingMode?: BookingMode;
    };
  }>("/studios", async (request) => {
    const filters: StudioSearchFilters = {
      cityId: request.query.cityId,
      query: request.query.query,
      maxPrice: request.query.maxPrice ? Number(request.query.maxPrice) : undefined,
      shootType: request.query.shootType,
      featureIds: toArray<FeatureId>(request.query.featureIds),
      equipmentIds: toArray<EquipmentId>(request.query.equipmentIds),
      amenityIds: toArray<AmenityId>(request.query.amenityIds),
      bookingMode: request.query.bookingMode
    };

    return {
      studios: searchStudios(seedStudios, filters),
      total: searchStudios(seedStudios, filters).length
    };
  });

  app.get<{ Params: { slug: string } }>("/studios/:slug", async (request, reply) => {
    const studio = findStudioBySlug(seedStudios, request.params.slug);

    if (!studio) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    return { studio };
  });

  app.get("/taxonomy", async () => ({
    taxonomy
  }));

  return app;
};
