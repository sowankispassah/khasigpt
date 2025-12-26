import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-static";

export default function PublicLandingPage() {
  return <PublicLanding />;
}

function PublicLanding() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col items-center justify-center gap-10 px-6 py-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <Image
          alt="KhasiGPT logo"
          className="h-9 w-auto dark:brightness-150 dark:invert"
          height={36}
          priority
          src="/images/khasigptlogo.png"
          width={200}
        />
        <div className="space-y-3">
          <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
            Khasi-first AI assistance
          </h1>
          <p className="mx-auto max-w-2xl text-muted-foreground text-base sm:text-lg">
            Translate, write, and research in Khasi with a modern chat
            experience. Sign in to continue.
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Button asChild className="min-w-[140px]">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild className="min-w-[140px]" variant="outline">
            <Link href="/register">Create account</Link>
          </Button>
          <Button asChild className="min-w-[140px]" variant="ghost">
            <Link href="/about">Learn more</Link>
          </Button>
        </div>
      </div>

      <section className="grid w-full gap-4 sm:grid-cols-3">
        <FeatureCard
          description="Prompts and UI tuned for Khasi speakers."
          title="Localized by design"
        />
        <FeatureCard
          description="Choose OpenAI, Anthropic, or Gemini models."
          title="Flexible model catalog"
        />
        <FeatureCard
          description="Fast navigation, saved history, and a clean editor."
          title="Built for speed"
        />
      </section>

      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-muted-foreground text-sm">
        <Link className="cursor-pointer hover:text-foreground" href="/privacy-policy">
          Privacy
        </Link>
        <span aria-hidden="true">•</span>
        <Link className="cursor-pointer hover:text-foreground" href="/terms-of-service">
          Terms
        </Link>
        <span aria-hidden="true">•</span>
        <Link className="cursor-pointer hover:text-foreground" href="/forum">
          Forum
        </Link>
      </footer>
    </main>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border bg-card/60 p-5 shadow-sm">
      <h2 className="font-semibold text-base">{title}</h2>
      <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
        {description}
      </p>
    </div>
  );
}
