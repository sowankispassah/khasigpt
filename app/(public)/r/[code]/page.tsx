import { notFound } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { REFERRAL_COPY } from "@/lib/referrals/copy";
import { creatorPlayStoreUrl } from "@/lib/referrals/links";
import { normalizeReferralCode } from "@/lib/referrals/rules";
import { getReferralByCode } from "@/lib/referrals/service";
import { getReferralSettings } from "@/lib/referrals/settings";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export default async function ReferralPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeReferralCode((await params).code);
  if (!code) notFound();
  const [referral, settings, session] = await withTimeout(Promise.all([getReferralByCode(code), getReferralSettings(), auth()]), 7000);
  if (!referral || settings.referralAccessMode === "disabled" || (settings.referralAccessMode === "admin_only" && session?.user.role !== "admin")) notFound();
  const playUrl = creatorPlayStoreUrl(code);
  return <div className="mx-auto max-w-xl space-y-6 px-5 py-16">
    <h1 className="text-3xl font-semibold"><EditableTranslation translationKey="referrals.join" defaultText={REFERRAL_COPY.join} /></h1>
    <p><EditableTranslation translationKey="referrals.welcome" defaultText={REFERRAL_COPY.welcome} /></p>
    <div className="flex flex-wrap gap-4">
      <a data-nav className="cursor-pointer rounded-lg border bg-primary px-4 py-3 text-primary-foreground" href={`/api/referrals/start?code=${code}`}><EditableTranslation translationKey="referrals.signup" defaultText={REFERRAL_COPY.signup} /></a>
      <a className="cursor-pointer rounded-lg border px-4 py-3" href={playUrl}><EditableTranslation translationKey="referrals.install" defaultText={REFERRAL_COPY.install} /></a>
    </div>
  </div>;
}
