import { WifiOff } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="rounded-full bg-muted p-4 text-muted-foreground">
        <WifiOff aria-hidden className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h1 className="font-semibold text-2xl">You&apos;re offline</h1>
        <p className="text-muted-foreground">
          No internet connection detected. Once you&apos;re back online, you can
          keep chatting with KhasiGPT in the browser or installed app.
        </p>
      </div>
      <Button asChild className="cursor-pointer" variant="default">
        <Link href="/">Retry connection</Link>
      </Button>
    </main>
  );
}
