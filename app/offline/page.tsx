import { WifiOff } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getTranslationBundle } from "@/lib/i18n/dictionary";

export default async function OfflinePage() {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const { dictionary } = await getTranslationBundle(preferredLanguage);
  const t = (key: string, fallback: string) => dictionary[key] ?? fallback;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="rounded-full bg-muted p-4 text-muted-foreground">
        <WifiOff aria-hidden className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h1 className="font-semibold text-2xl">
          {t("offline.title", "You're offline")}
        </h1>
        <p className="text-muted-foreground">
          {t(
            "offline.message",
            "No internet connection detected. Once you're back online, you can keep chatting with KhasiGPT in the browser or installed app."
          )}
        </p>
      </div>
      <Button asChild className="cursor-pointer" variant="default">
        <Link href="/">{t("offline.retry", "Retry connection")}</Link>
      </Button>
    </main>
  );
}
