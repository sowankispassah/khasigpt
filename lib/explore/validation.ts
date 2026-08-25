import { z } from "zod";

export const exploreLocationSchema = z.object({
  id: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(160),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  // Browser geolocation may legitimately report very coarse accuracy
  // (for example 200 km on desktop/IP-assisted positioning). Accuracy is
  // metadata, so it must not invalidate otherwise usable coordinates.
  accuracy: z.number().finite().min(0).nullable(),
  source: z.enum(["gps", "manual"]),
});

export const exploreSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  categoryId: z.string().uuid().nullable().optional(),
  subcategoryId: z.string().uuid().nullable().optional(),
  chatId: z.string().uuid().nullable().optional(),
  clientRequestId: z.string().trim().min(1).max(120),
  locationContextKey: z.string().trim().min(1).max(80).nullable().optional(),
  radiusKm: z.number().int().min(1).max(50),
  location: exploreLocationSchema,
});

export const exploreLocationRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("manual"),
    query: z.string().trim().min(2).max(120),
  }),
  z.object({
    mode: z.literal("reverse"),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracy: z.number().finite().min(0).nullable().optional(),
  }),
]);
