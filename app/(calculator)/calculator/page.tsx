import type { Metadata } from "next";
import { CalculatorWorkbench } from "@/components/calculator-workbench";
import { SidebarToggle } from "@/components/sidebar-toggle";

export const metadata: Metadata = {
  title: "Calculator",
  description: "Calculator with deterministic number-to-words output.",
};

export default function CalculatorPage() {
  return (
    <>
      <header className="sticky top-0 z-10 relative flex items-center gap-2 bg-background px-2 py-1.5">
        <SidebarToggle />
        <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-semibold text-[15px]">
          Calculator
        </h1>
      </header>

      <div className="mx-auto flex h-[100svh] w-full max-w-5xl flex-col overflow-hidden px-3 py-3 sm:h-auto sm:overflow-visible sm:px-4 sm:py-5 md:py-8">
        <div className="min-h-0 flex-1">
          <CalculatorWorkbench />
        </div>
      </div>
    </>
  );
}
