"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";

import { useTranslation } from "@/components/language-provider";

type DailyUsageRangeSelectProps = {
  currentRange: number;
  options: readonly number[];
};

export function DailyUsageRangeSelect({
  currentRange,
  options,
}: DailyUsageRangeSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { translate } = useTranslation();
  const [isPending, startTransition] = useTransition();

  const paramsSnapshot = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams]
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextParams = new URLSearchParams(paramsSnapshot);
      nextParams.set("range", event.target.value);
      nextParams.delete("sessionsPage");

      const query = nextParams.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [paramsSnapshot, pathname, router]
  );

  return (
    <div className="flex items-center gap-2 text-sm">
      <label
        className="font-medium text-muted-foreground text-xs"
        htmlFor="daily-usage-range"
      >
        {translate("subscriptions.range.label", "Range")}
      </label>
      <select
        aria-busy={isPending}
        className="h-10 cursor-pointer rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        id="daily-usage-range"
        onChange={handleChange}
        value={String(currentRange)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {translate(
              "subscriptions.range.option",
              "Last {days} days"
            ).replace("{days}", String(option))}
          </option>
        ))}
      </select>
      {isPending ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}
