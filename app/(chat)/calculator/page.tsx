import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";
import { CalculatorWorkbench } from "@/components/calculator-workbench";
import { isCalculatorEnabledForRole } from "@/lib/calculator/config";

export const metadata: Metadata = {
  title: "Calculator",
  description: "Calculator with deterministic number-to-words output.",
};

export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
  const session = await auth();
  const calculatorEnabled = await isCalculatorEnabledForRole(
    session?.user?.role ?? null
  );

  if (!calculatorEnabled) {
    notFound();
  }

  if (!session?.user) {
    redirect("/login?callbackUrl=/calculator");
  }

  return (
    <div className="mx-auto flex h-[100svh] w-full max-w-5xl flex-col gap-2 overflow-hidden px-3 pt-1 pb-2 sm:h-auto sm:gap-4 sm:overflow-visible sm:px-4 sm:py-6 md:gap-6 md:py-10">
      <div className="relative flex min-h-8 items-center">
        <BackToHomeButton label="Back to home" />
        <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-semibold text-[15px]">
          Calculator
        </h1>
      </div>
      <div className="min-h-0 flex-1">
        <CalculatorWorkbench />
      </div>
    </div>
  );
}
