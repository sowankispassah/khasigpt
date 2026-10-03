import { z } from "zod";
import { type ContactAccountSummary, isContactAccountSummary } from "@/lib/contact/account-summary";

const timestamp = z.string().datetime();
export const userDetailsSchema = z.object({
  account: z.custom<ContactAccountSummary>(isContactAccountSummary),
  currentAdminId: z.string().uuid(),
  profile: z.object({
    dateOfBirth: z.string().nullable(),
    updatedAt: timestamp,
    locationConsent: z.boolean(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    accuracy: z.number().nullable(),
    locationUpdatedAt: timestamp.nullable(),
  }),
  activity: z
    .object({
      lastLoginAt: timestamp.nullable(),
      lastSeenAt: timestamp.nullable(),
      lastPath: z.string().nullable(),
      device: z.string().nullable(),
      locale: z.string().nullable(),
      timezone: z.string().nullable(),
      city: z.string().nullable(),
      region: z.string().nullable(),
      country: z.string().nullable(),
    })
    .nullable(),
  activityUnavailable: z.boolean(),
});
export type AdminUserDetails = z.infer<typeof userDetailsSchema>;
export const supportHistorySchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      subject: z.string(),
      status: z.enum(["new", "in_progress", "resolved", "archived"]),
      isViewed: z.boolean(),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastInboundAt: timestamp.nullable(),
    }),
  ),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
});
export type UserSupportHistory = z.infer<typeof supportHistorySchema>;
export const supportPageSize = 10;

export function supportConversationUrl(id: string) {
  return `/admin/contacts?contact=${encodeURIComponent(id)}`;
}
