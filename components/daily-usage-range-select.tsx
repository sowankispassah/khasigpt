"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { useTranslation } from "@/components/language-provider";

type DailyUsageRangeSelectProps = {
  currentRange: number;
  options: readonly number[];
  className?: string;
};

export function DailyUsageRangeSelect({
  currentRange,
  options,
  className,
}: DailyUsageRangeSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { translate } = useTranslation();

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
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [paramsSnapshot, pathname, router]
  );

  return (
    <div
      className={`flex items-center gap-2 text-sm${
        className ? ` ${className}` : ""
      }`}
    >
      <label
        className="font-medium text-muted-foreground text-xs"
        htmlFor="daily-usage-range"
      >
        {translate("subscriptions.range.label", "Range")}
      </label>
      <select
        className="rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    </div>
  );
}
