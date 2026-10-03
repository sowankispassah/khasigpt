import "server-only";

import { and, eq } from "drizzle-orm";
import { withAdminDatabase } from "@/lib/db/admin-database";
import { auditLog, emailVerificationToken, user } from "@/lib/db/schema";

export async function verifyUserEmailForAdmin({
  actorId,
  userId,
}: {
  actorId: string;
  userId: string;
}) {
  if (actorId === userId) throw new Error("self_update_not_allowed");

  return withAdminDatabase("users.verify-email", (adminDb) =>
    adminDb.transaction(async (tx) => {
      // Only a pending account can be activated. A repeated/stale request must
      // preserve a suspension applied after verification.
      const [updated] = await tx.update(user)
        .set({ emailVerificationPending: false, isActive: true, updatedAt: new Date() })
        .where(and(eq(user.id, userId), eq(user.emailVerificationPending, true)))
        .returning({ id: user.id, emailVerificationPending: user.emailVerificationPending, isActive: user.isActive });

      if (!updated) {
        const [existing] = await tx.select({ id: user.id, emailVerificationPending: user.emailVerificationPending, isActive: user.isActive })
          .from(user).where(eq(user.id, userId)).limit(1);
        return existing ?? null;
      }

      await tx.delete(emailVerificationToken).where(eq(emailVerificationToken.userId, userId));
      // Keep the verification, token cleanup, and audit record atomic.
      await tx.insert(auditLog).values({
        actorId,
        subjectUserId: userId,
        action: "user.email.verify_manual",
        target: { userId },
        metadata: { method: "admin_manual", emailVerificationPending: false, isActive: true },
      });
      return updated;
    })
  );
}
