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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-3 pt-1 pb-3 sm:gap-4 sm:px-4 sm:py-6 md:gap-6 md:py-10">
      <div className="relative flex min-h-8 items-center">
        <BackToHomeButton label="Back to home" />
        <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-semibold text-[15px]">
          Calculator
        </h1>
      </div>
      <CalculatorWorkbench />
    </div>
  );
}
