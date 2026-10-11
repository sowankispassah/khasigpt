import { getDownloadUrl } from "@vercel/blob";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getActiveUserProfileImage,
  getUserBalanceSummary,
  getUserById,
} from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { listPersonalKnowledgeForUser } from "@/lib/rag/service";
import { withTimeout } from "@/lib/utils/async";
import { getChatRouteSession } from "../chat-route-session";
import type { SerializedPersonalKnowledgeEntry } from "./personal-knowledge-section";
import { type ProfileAccountSummary, ProfileView } from "./profile-view";

export const dynamic = "force-dynamic";

// The plan summary is secondary: never let it hold up the profile page.
const BALANCE_TIMEOUT_MS = 4000;

export default async function ProfilePage() {
  const session = await getChatRouteSession();

  if (!session?.user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const [{ dictionary }, currentUser, activeProfileImage, balance] =
    await Promise.all([
      getTranslationBundle(preferredLanguage),
      getUserById(session.user.id),
      getActiveUserProfileImage({ userId: session.user.id }),
      withTimeout(getUserBalanceSummary(session.user.id), BALANCE_TIMEOUT_MS).catch(
        (error) => {
          console.error("[profile] Balance read failed.", error);
          return null;
        }
      ),
    ]);

  const allowPersonalKnowledge = Boolean(
    currentUser?.allowPersonalKnowledge ?? session.user.allowPersonalKnowledge
  );
  const personalKnowledgeEntries: SerializedPersonalKnowledgeEntry[] =
    allowPersonalKnowledge
      ? (await listPersonalKnowledgeForUser(session.user.id)).map((entry) => ({
          ...entry,
          createdAt:
            entry.createdAt instanceof Date
              ? entry.createdAt.toISOString()
              : (entry.createdAt as unknown as string),
          updatedAt:
            entry.updatedAt instanceof Date
              ? entry.updatedAt.toISOString()
              : (entry.updatedAt as unknown as string),
        }))
      : [];

  const initialAvatar = (() => {
    const raw = activeProfileImage?.imageUrl ?? currentUser?.image ?? null;
    if (!raw) {
      return null;
    }
    try {
      return getDownloadUrl(raw);
    } catch {
      return /^(data:|https?:\/\/)/.test(raw) ? raw : null;
    }
  })();

  const account: ProfileAccountSummary = balance
    ? {
        creditsRemaining: balance.creditsRemaining,
        creditsTotal: balance.creditsTotal,
        expiresAt: balance.expiresAt,
        planName: balance.plan
          ? dictionary[`recharge.plan.${balance.plan.id}.name`]?.trim() ||
            balance.plan.name
          : null,
        status: "ok",
      }
    : { status: "unavailable" };

  return (
    <ProfileView
      account={account}
      allowPersonalKnowledge={allowPersonalKnowledge}
      authProvider={currentUser?.authProvider ?? null}
      email={session.user.email ?? null}
      firstName={currentUser?.firstName ?? session.user.firstName ?? null}
      initialAvatar={initialAvatar}
      lastName={currentUser?.lastName ?? session.user.lastName ?? null}
      memberSince={currentUser?.createdAt ?? null}
      personalKnowledgeEntries={personalKnowledgeEntries}
      sessionName={session.user.name ?? null}
    />
  );
}
