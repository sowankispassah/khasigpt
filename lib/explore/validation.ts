import { z } from "zod";

export const exploreSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  categoryId: z.string().uuid().nullable().optional(),
  subcategoryId: z.string().uuid().nullable().optional(),
  chatId: z.string().uuid().nullable().optional(),
  radiusKm: z.number().int().min(1).max(50).nullable().optional(),
  location: z
    .object({
      label: z.string().trim().max(120).nullable().optional(),
      latitude: z.number().min(-90).max(90).nullable().optional(),
      longitude: z.number().min(-180).max(180).nullable().optional(),
      // Browser geolocation may legitimately report very coarse accuracy
      // (for example 200 km on desktop/IP-assisted positioning). Accuracy is
      // metadata, so it must not invalidate otherwise usable coordinates.
      accuracy: z.number().finite().min(0).nullable().optional(),
    })
    .nullable()
    .optional(),
});
