"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

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
    <div className="flex items-center gap-2 text-sm">
      <label
        className="text-xs font-medium text-muted-foreground"
        htmlFor="daily-usage-range"
      >
        Range
      </label>
      <select
        className="rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id="daily-usage-range"
        onChange={handleChange}
        value={String(currentRange)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            Last {option} days
          </option>
        ))}
      </select>
    </div>
  );
}
