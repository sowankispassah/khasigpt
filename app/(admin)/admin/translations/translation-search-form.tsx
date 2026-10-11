"use client";

import { Loader2, Search } from "lucide-react";
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
        router.replace(queryString ? `${pathname}?${queryString}` : pathname);
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
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Search translations"
          className="h-9 rounded-lg pr-24 pl-9"
          onChange={handleChange}
          placeholder="Search by key, description, or translated text…"
          type="search"
          value={value}
        />
        <span
          aria-live="polite"
          className={cn(
            "pointer-events-none absolute top-1/2 right-3 inline-flex -translate-y-1/2 items-center gap-1.5 bg-background text-muted-foreground text-xs transition-opacity",
            isPending ? "opacity-100" : "opacity-0"
          )}
        >
          <Loader2 aria-hidden="true" className="size-3 animate-spin" />
          Updating…
        </span>
      </div>
      {value.trim().length > 0 ? (
        <Button
          className="h-9 shrink-0 cursor-pointer whitespace-nowrap"
          onClick={handleClear}
          type="button"
          variant="outline"
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}
