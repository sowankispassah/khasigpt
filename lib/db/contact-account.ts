import "server-only";

import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import type { ContactAccountSummary } from "@/lib/contact/account-summary";
import { withAdminDatabase } from "@/lib/db/admin-database";
import { chat, contactMessage, pricingPlan, user, userSubscription } from "@/lib/db/schema";

export async function getContactAccountSummary(
  contactId: string,
): Promise<ContactAccountSummary | null | undefined> {
  return withAdminDatabase("contacts.account", async (adminDb) => {
    const [match] = await adminDb
      .select({
        contactId: contactMessage.id,
        ...accountColumns,
      })
      .from(contactMessage)
      .leftJoin(user, sql`lower(${user.email}) = lower(trim(${contactMessage.email}))`)
      .where(and(eq(contactMessage.id, contactId), eq(contactMessage.kind, "contact")))
      .limit(1);

    if (!match) return undefined;
    if (
      !match.id ||
      !match.email ||
      !match.role ||
      !match.authProvider ||
      match.isActive === null ||
      match.emailVerificationPending === null ||
      match.allowPersonalKnowledge === null ||
      !match.createdAt
    )
      return null;

    return hydrateAccountSummary(adminDb, {
      ...match,
      id: match.id,
      email: match.email,
      role: match.role,
      authProvider: match.authProvider,
      isActive: match.isActive,
      emailVerificationPending: match.emailVerificationPending,
      allowPersonalKnowledge: match.allowPersonalKnowledge,
      createdAt: match.createdAt,
    });
  });
}

export const accountColumns = {
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  image: user.image,
  allowPersonalKnowledge: user.allowPersonalKnowledge,
  role: user.role,
  authProvider: user.authProvider,
  isActive: user.isActive,
  emailVerificationPending: user.emailVerificationPending,
  createdAt: user.createdAt,
};

export async function hydrateAccountSummary(
  adminDb: Parameters<Parameters<typeof withAdminDatabase>[1]>[0],
  match: Pick<typeof user.$inferSelect, keyof typeof accountColumns>,
): Promise<ContactAccountSummary> {
  const account: ContactAccountSummary = {
    id: match.id,
    email: match.email,
    firstName: match.firstName,
    lastName: match.lastName,
    image: match.image,
    allowPersonalKnowledge: match.allowPersonalKnowledge,
    chatCount: null,
    role: match.role,
    authProvider: match.authProvider,
    isActive: match.isActive,
    emailVerificationPending: match.emailVerificationPending,
    createdAt: match.createdAt.toISOString(),
    subscription: null,
    subscriptionUnavailable: false,
  };

  const loadSubscription = async () => {
    try {
      const [subscription] = await adminDb
        .select({
          planName: pricingPlan.name,
          tokenBalance: userSubscription.tokenBalance,
          expiresAt: userSubscription.expiresAt,
        })
        .from(userSubscription)
        .leftJoin(pricingPlan, eq(userSubscription.planId, pricingPlan.id))
        .where(
          and(
            eq(userSubscription.userId, account.id),
            eq(userSubscription.status, "active"),
            gt(userSubscription.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(userSubscription.startedAt), desc(userSubscription.id))
        .limit(1);
      if (subscription)
        account.subscription = {
          planName: subscription.planName,
          creditsRemaining: Math.max(0, subscription.tokenBalance) / TOKENS_PER_CREDIT,
          expiresAt: subscription.expiresAt.toISOString(),
        };
    } catch {
      console.warn("[admin.contacts] Matched account subscription lookup failed.");
      account.subscriptionUnavailable = true;
    }
  };

  const loadChatCount = async () => {
    try {
      const [row] = await adminDb
        .select({ total: count(chat.id) })
        .from(chat)
        .where(eq(chat.userId, account.id));
      account.chatCount = row?.total ?? null;
    } catch {
      console.warn("[admin.contacts] Matched account chat count unavailable.");
    }
  };

  await Promise.all([loadSubscription(), loadChatCount()]);

  return account;
}
