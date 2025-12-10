"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 350;

export function TranslationSearchForm({
  defaultValue,
}: {
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const updateRoute = useCallback(
    (nextValue: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (nextValue.trim().length === 0) {
        params.delete("q");
      } else {
        params.set("q", nextValue);
      }

      const queryString = params.toString();

      startTransition(() => {
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams]
  );

  const scheduleUpdate = useCallback(
    (nextValue: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        updateRoute(nextValue);
      }, DEBOUNCE_MS);
    },
    [updateRoute]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setValue(next);
    scheduleUpdate(next);
  };

  const handleClear = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setValue("");
    updateRoute("");
  };

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2">
          <Input
            aria-label="Search translations"
            className="flex-1"
            onChange={handleChange}
            placeholder="Search by key, description, or translated text…"
            type="search"
            value={value}
          />
          {value.trim().length > 0 ? (
            <Button
              className="whitespace-nowrap"
              onClick={handleClear}
              type="button"
              variant="outline"
            >
              Clear
            </Button>
          ) : null}
        </div>
        <span
          aria-live="polite"
          className={cn(
            "text-muted-foreground text-xs transition-opacity",
            isPending ? "opacity-100" : "opacity-0"
          )}
        >
          Updating…
        </span>
      </div>
    </div>
  );
}
