import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { supportPageSize } from "@/lib/admin/user-details";
import { withAdminDatabase } from "@/lib/db/admin-database";
import { accountColumns, hydrateAccountSummary } from "@/lib/db/contact-account";
import { auditLog, contactMessage, user, userPresence } from "@/lib/db/schema";

export async function getAdminUserDetails(id: string) {
  return withAdminDatabase("users.details", async (db) => {
    const [row] = await db
      .select({
        ...accountColumns,
        dateOfBirth: user.dateOfBirth,
        updatedAt: user.updatedAt,
        locationConsent: user.locationConsent,
        latitude: user.locationLatitude,
        longitude: user.locationLongitude,
        accuracy: user.locationAccuracy,
        locationUpdatedAt: user.locationUpdatedAt,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    if (!row) return null;
    const activity = async () => {
      try {
        const [[presence], [login]] = await Promise.all([
          db
            .select({
              lastSeenAt: userPresence.lastSeenAt,
              lastPath: userPresence.lastPath,
              device: userPresence.device,
              locale: userPresence.locale,
              timezone: userPresence.timezone,
              city: userPresence.city,
              region: userPresence.region,
              country: userPresence.country,
            })
            .from(userPresence)
            .where(eq(userPresence.userId, id))
            .limit(1),
          db
            .select({ createdAt: auditLog.createdAt })
            .from(auditLog)
            .where(
              and(
                eq(auditLog.subjectUserId, id),
                inArray(auditLog.action, ["user.login", "user.signup"]),
              ),
            )
            .orderBy(desc(auditLog.createdAt))
            .limit(1),
        ]);
        return {
          activity: {
            lastLoginAt: login?.createdAt.toISOString() ?? null,
            lastSeenAt: presence?.lastSeenAt.toISOString() ?? null,
            lastPath: presence?.lastPath ?? null,
            device: presence?.device ?? null,
            locale: presence?.locale ?? null,
            timezone: presence?.timezone ?? null,
            city: presence?.city ?? null,
            region: presence?.region ?? null,
            country: presence?.country ?? null,
          },
          activityUnavailable: false,
        };
      } catch {
        console.warn("[admin.users] Activity details unavailable.");
        return { activity: null, activityUnavailable: true };
      }
    };
    const [account, activityState] = await Promise.all([
      hydrateAccountSummary(db, row),
      activity(),
    ]);
    return {
      account,
      profile: {
        dateOfBirth: row.dateOfBirth,
        updatedAt: row.updatedAt.toISOString(),
        locationConsent: row.locationConsent,
        latitude: row.locationConsent ? row.latitude : null,
        longitude: row.locationConsent ? row.longitude : null,
        accuracy: row.locationConsent ? row.accuracy : null,
        locationUpdatedAt: row.locationConsent
          ? (row.locationUpdatedAt?.toISOString() ?? null)
          : null,
      },
      ...activityState,
    };
  });
}

export async function getAdminUserSupportHistory(id: string, offset: number) {
  return withAdminDatabase("users.support-history", async (db) => {
    const [account] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    if (!account) return null;
    const filter = and(
      eq(contactMessage.kind, "contact"),
      sql`lower(trim(${contactMessage.email})) = ${account.email.trim().toLowerCase()}`,
    );
    const [items, [total]] = await Promise.all([
      db
        .select({
          id: contactMessage.id,
          subject: contactMessage.subject,
          status: contactMessage.status,
          isViewed: contactMessage.isViewed,
          createdAt: contactMessage.createdAt,
          updatedAt: contactMessage.updatedAt,
          lastInboundAt: contactMessage.lastInboundAt,
        })
        .from(contactMessage)
        .where(filter)
        .orderBy(desc(contactMessage.createdAt), desc(contactMessage.id))
        .limit(supportPageSize)
        .offset(offset),
      db.select({ value: count() }).from(contactMessage).where(filter),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        lastInboundAt: item.lastInboundAt?.toISOString() ?? null,
      })),
      total: total?.value ?? 0,
      offset,
    };
  });
}

export async function getAdminContactById(id: string) {
  return withAdminDatabase("contacts.selected", async (db) => {
    const [message] = await db
      .select()
      .from(contactMessage)
      .where(and(eq(contactMessage.id, id), eq(contactMessage.kind, "contact")))
      .limit(1);
    return message ?? null;
  });
}
