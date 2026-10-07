import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <section className="w-full max-w-sm rounded-xl border bg-card p-6 text-center shadow-sm">
        <p className="font-medium text-muted-foreground text-sm">404</p>
        <h1 className="mt-1 font-semibold text-xl">Page not found</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          The page you are looking for does not exist or has moved.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm"
            href="/"
          >
            Back to home
          </Link>
          <Link
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border px-4 font-medium text-sm"
            href="/about#contact"
          >
            Contact support
          </Link>
        </div>
      </section>
    </main>
  );
}
