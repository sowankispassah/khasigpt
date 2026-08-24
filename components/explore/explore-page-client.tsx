"use client";

import {
  Compass,
  ExternalLink,
  icons,
  LoaderCircle,
  LocateFixed,
  MapPin,
  MessageCircle,
  Navigation,
  Search,
  Star,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import {
  EditableTranslation,
  useEditableTranslation,
} from "@/components/translation-edit-provider";
import type {
  ExploreCategoryDto,
  ExploreLocationInput,
  ExploreResult,
  ExploreSearchResponse,
} from "@/lib/explore/types";
import { startGlobalProgress } from "@/lib/ui/global-progress";

function DynamicIcon({
  name,
  className = "size-5",
}: {
  name: string;
  className?: string;
}) {
  const Icon = (icons as Record<string, typeof Compass>)[name] ?? Compass;
  return <Icon className={className} />;
}

function needsLocation(query: string, category: ExploreCategoryDto | null) {
  return (
    /\b(near me|nearby|around me|closest|within\s+\d+\s*km)\b/i.test(query) ||
    category?.locationMode === "current_preferred" ||
    category?.locationMode === "selected" ||
    category?.locationMode === "current_or_selected"
  );
}

export function ExplorePageClient({
  initialCategories,
}: {
  initialCategories: ExploreCategoryDto[] | null;
}) {
  const router = useRouter();
  const { translate } = useTranslation();
  const { text: placeholder, editButton: placeholderEdit } =
    useEditableTranslation(
      "explore.search.placeholder",
      "What would you like to explore?",
      "Placeholder for the Explore Meghalaya natural-language search field.",
    );
  const {
    text: manualLocationPlaceholder,
    editButton: manualLocationPlaceholderEdit,
  } = useEditableTranslation(
    "explore.location.placeholder",
    "Shillong, Jowai, Sohra, Tura...",
    "Placeholder for manually entering an Explore Meghalaya location.",
  );
  const [categories, setCategories] = useState(initialCategories ?? []);
  const [categoriesUnavailable, setCategoriesUnavailable] = useState(
    initialCategories === null,
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<ExploreLocationInput | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [manualLocation, setManualLocation] = useState("");
  const [radiusKm, setRadiusKm] = useState<5 | 10 | 25 | 50 | null>(null);
  const [locationPending, setLocationPending] = useState(false);
  const [searchPending, setSearchPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ExploreSearchResponse | null>(null);
  const [detail, setDetail] = useState<ExploreResult | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = JSON.parse(
        window.localStorage.getItem("explore.savedResults") ?? "[]",
      );
      return new Set(
        Array.isArray(stored)
          ? stored.filter((item): item is string => typeof item === "string")
          : [],
      );
    } catch {
      return new Set();
    }
  });
  const [chatPending, setChatPending] = useState(false);
  const selectedCategory = useMemo(
    () => categories.find((item) => item.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );

  useEffect(() => {
    window.localStorage.setItem(
      "explore.savedResults",
      JSON.stringify(Array.from(savedIds)),
    );
  }, [savedIds]);

  const refreshCategories = async () => {
    setError(null);
    try {
      const res = await fetch("/api/explore/categories", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { categories: ExploreCategoryDto[] };
      setCategories(body.categories);
      setCategoriesUnavailable(false);
    } catch {
      setError(
        translate(
          "explore.categories.error",
          "Unable to load Explore categories right now.",
        ),
      );
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError(
        translate(
          "explore.location.permission_error",
          "Unable to get your current location. Enter a location manually.",
        ),
      );
      return;
    }
    setLocationPending(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          label: translate("explore.location.current", "Current location"),
        });
        setLocationPending(false);
        setLocationOpen(false);
      },
      () => {
        setLocationPending(false);
        setError(
          translate(
            "explore.location.permission_error",
            "Unable to get your current location. Enter a location manually.",
          ),
        );
        setLocationOpen(true);
      },
      { enableHighAccuracy: true, maximumAge: 5 * 60_000, timeout: 12_000 },
    );
  };

  const runSearch = async ({
    submittedQuery,
    subcategoryId,
  }: {
    submittedQuery: string;
    subcategoryId?: string;
  }) => {
    const normalized = submittedQuery.trim();
    if (!normalized) return;
    if (
      needsLocation(normalized, selectedCategory) &&
      !location &&
      !/\b(?:in|near|around|at)\s+[a-z][a-z .'-]{2,80}$/i.test(normalized)
    ) {
      setLocationOpen(true);
      return;
    }
    setSearchPending(true);
    setError(null);
    try {
      const res = await fetch("/api/explore/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: normalized,
          categoryId: selectedCategory?.id ?? null,
          subcategoryId: subcategoryId ?? null,
          chatId: response?.chatId ?? null,
          location,
          radiusKm,
        }),
      });
      const body = (await res
        .json()
        .catch(() => ({}))) as ExploreSearchResponse & {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        if (body.error === "location_required") setLocationOpen(true);
        throw new Error(
          body.message ||
            translate(
              "explore.error.search",
              "Unable to load Explore results right now. Please try again.",
            ),
        );
      }
      setResponse(body);
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : translate(
              "explore.error.search",
              "Unable to load Explore results right now. Please try again.",
            ),
      );
    } finally {
      setSearchPending(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runSearch({ submittedQuery: query });
  };

  const askKhasiGpt = async (result: ExploreResult) => {
    if (!response?.chatId || chatPending) return;
    setChatPending(true);
    try {
      await fetch("/api/explore/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: response.chatId,
          result: {
            name: result.name,
            address: result.address,
            sourceUrl: result.sourceUrl,
          },
        }),
      });
    } finally {
      startGlobalProgress();
      router.push(`/chat/${response.chatId}`);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 pb-24 md:p-8">
      <header>
        <h1 className="font-semibold text-3xl tracking-tight">
          <EditableTranslation
            defaultText="Explore Meghalaya"
            description="Explore Meghalaya page title."
            translationKey="explore.title"
          />
        </h1>
        <p className="mt-2 text-muted-foreground">
          <EditableTranslation
            defaultText="Discover places, businesses, food, events and experiences across Meghalaya."
            description="Explore Meghalaya page subtitle."
            translationKey="explore.subtitle"
          />
        </p>
      </header>

      <section className="rounded-2xl border bg-card p-3 shadow-sm md:p-4">
        <form className="flex flex-col gap-3 md:flex-row" onSubmit={submit}>
          <div className="relative min-w-0 flex-1">
            <Search className="absolute top-3 left-3 size-5 text-muted-foreground" />
            <input
              aria-label={placeholder}
              className="min-h-11 w-full rounded-xl border bg-background pr-3 pl-10 outline-none focus:ring-2 focus:ring-primary/30"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              value={query}
            />
            {placeholderEdit}
          </div>
          <button
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={searchPending || !query.trim()}
            type="submit"
          >
            {searchPending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                <EditableTranslation
                  defaultText="Finding places..."
                  translationKey="explore.search.searching"
                />
              </>
            ) : (
              <EditableTranslation
                defaultText="Explore"
                translationKey="explore.search.submit"
              />
            )}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm"
            onClick={() => setLocationOpen(true)}
            type="button"
          >
            <MapPin className="size-4" />
            {location?.label || (
              <EditableTranslation
                defaultText="Choose location"
                translationKey="explore.location.choose"
              />
            )}
          </button>
          <select
            aria-label={translate("explore.location.radius", "Search radius")}
            className="min-h-10 cursor-pointer rounded-full border bg-background px-3 text-sm"
            onChange={(event) =>
              setRadiusKm(
                event.target.value
                  ? (Number(event.target.value) as 5 | 10 | 25 | 50)
                  : null,
              )
            }
            value={radiusKm ?? ""}
          >
            <option value="">
              {translate("explore.location.nearby", "Nearby")}
            </option>
            {[5, 10, 25, 50].map((distance) => (
              <option key={distance} value={distance}>
                {translate(
                  "explore.location.within_km",
                  "Within {distance} km",
                ).replace("{distance}", String(distance))}
              </option>
            ))}
          </select>
        </div>
      </section>

      {categoriesUnavailable ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <EditableTranslation
            defaultText="Unable to load Explore categories right now."
            translationKey="explore.categories.error"
          />{" "}
          <button
            className="ml-2 cursor-pointer underline"
            onClick={refreshCategories}
            type="button"
          >
            <EditableTranslation
              defaultText="Retry"
              translationKey="common.retry"
            />
          </button>
        </div>
      ) : null}
      {!categoriesUnavailable && categories.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <EditableTranslation
            defaultText="Explore categories have not been configured yet."
            translationKey="explore.categories.empty"
          />
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const selected = selectedCategoryId === category.id;
          return (
            <button
              className={`min-h-24 cursor-pointer rounded-xl border p-4 text-left transition hover:border-primary/50 hover:bg-muted/40 ${selected ? "border-primary bg-primary/5" : "bg-card"}`}
              key={category.id}
              onClick={() =>
                setSelectedCategoryId(selected ? null : category.id)
              }
              type="button"
            >
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-primary/10 p-2 text-primary">
                  <DynamicIcon name={category.iconName} />
                </span>
                <div>
                  <p className="font-medium">{category.name}</p>
                  {category.description ? (
                    <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
                      {category.description}
                    </p>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {selectedCategory ? (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="font-semibold text-lg">{selectedCategory.name}</h2>
          <div className="flex flex-wrap gap-2">
            {selectedCategory.subcategories.map((subcategory) => (
              <button
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm hover:bg-muted"
                key={subcategory.id}
                onClick={() => {
                  setQuery(subcategory.name);
                  void runSearch({
                    submittedQuery: subcategory.name,
                    subcategoryId: subcategory.id,
                  });
                }}
                type="button"
              >
                <DynamicIcon className="size-4" name={subcategory.iconName} />
                {subcategory.name}
              </button>
            ))}
          </div>
          {selectedCategory.suggestedPrompts.length ? (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {selectedCategory.suggestedPrompts.map((prompt) => (
                <button
                  className="cursor-pointer rounded-full bg-muted px-3 py-2 text-sm"
                  key={prompt}
                  onClick={() => {
                    setQuery(prompt);
                    void runSearch({ submittedQuery: prompt });
                  }}
                  type="button"
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
          <span>{error}</span>
          <button
            className="cursor-pointer rounded-md border px-3 py-1.5"
            disabled={searchPending}
            onClick={() => query.trim() && runSearch({ submittedQuery: query })}
            type="button"
          >
            <EditableTranslation
              defaultText="Retry"
              translationKey="common.retry"
            />
          </button>
        </div>
      ) : null}
      {searchPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div
              className="h-64 animate-pulse rounded-xl bg-muted"
              key={item}
            />
          ))}
        </div>
      ) : null}
      {!searchPending && response ? (
        <section className="space-y-4">
          <div>
            <h2 className="font-semibold text-xl">
              <EditableTranslation
                defaultText="Search results"
                translationKey="explore.results.title"
              />
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {response.answer}
            </p>
          </div>
          {response.results.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
              <EditableTranslation
                defaultText="No grounded results were found. Try another search or location."
                translationKey="explore.results.empty"
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {response.results.map((result) => (
                <ResultCard
                  key={result.id}
                  onOpen={() => setDetail(result)}
                  result={result}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {locationOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl">
            <h2 className="font-semibold text-lg">
              <EditableTranslation
                defaultText="Location"
                translationKey="explore.location.title"
              />
            </h2>
            <button
              className="mt-4 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-60"
              disabled={locationPending}
              onClick={useCurrentLocation}
              type="button"
            >
              {locationPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <LocateFixed className="size-4" />
              )}
              <EditableTranslation
                defaultText={
                  locationPending
                    ? "Getting your location..."
                    : "Use My Current Location"
                }
                translationKey={
                  locationPending
                    ? "explore.location.getting"
                    : "explore.location.use_current"
                }
              />
            </button>
            <div className="mt-4 flex gap-2">
              <div className="min-w-0 flex-1">
                <input
                  className="min-h-11 w-full rounded-lg border bg-background px-3"
                  onChange={(event) => setManualLocation(event.target.value)}
                  placeholder={manualLocationPlaceholder}
                  value={manualLocation}
                />
                {manualLocationPlaceholderEdit}
              </div>
              <button
                className="cursor-pointer rounded-lg border px-4 text-sm"
                disabled={!manualLocation.trim()}
                onClick={() => {
                  setLocation({ label: manualLocation.trim() });
                  setLocationOpen(false);
                }}
                type="button"
              >
                <EditableTranslation
                  defaultText="Use location"
                  translationKey="explore.location.use_manual"
                />
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                className="cursor-pointer rounded-md px-3 py-2 text-sm"
                onClick={() => setLocationOpen(false)}
                type="button"
              >
                <EditableTranslation
                  defaultText="Cancel"
                  translationKey="common.cancel"
                />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-background shadow-xl">
            {detail.imageUrl ? (
              <Image
                alt=""
                className="aspect-video w-full rounded-t-xl object-cover"
                height={600}
                src={detail.imageUrl}
                unoptimized
                width={1000}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-t-xl bg-muted">
                <Compass className="size-16 text-muted-foreground/40" />
              </div>
            )}
            <div className="space-y-4 p-5">
              <div>
                <h2 className="font-semibold text-2xl">{detail.name}</h2>
                {detail.address ? (
                  <p className="mt-1 flex items-start gap-2 text-muted-foreground text-sm">
                    <MapPin className="mt-0.5 size-4 shrink-0" />
                    {detail.address}
                  </p>
                ) : null}
              </div>
              {detail.description ? (
                <p className="text-sm leading-6">{detail.description}</p>
              ) : null}
              <ResultMeta result={detail} />
              <div className="flex flex-wrap gap-2">
                {detail.directionsUrl ? (
                  <a
                    className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm"
                    href={detail.directionsUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <Navigation className="size-4" />
                    <EditableTranslation
                      defaultText="Directions"
                      translationKey="explore.result.directions"
                    />
                  </a>
                ) : null}
                <button
                  className="min-h-10 cursor-pointer rounded-md border px-3 text-sm"
                  onClick={() =>
                    setSavedIds((current) => {
                      const next = new Set(current);
                      next.has(detail.id)
                        ? next.delete(detail.id)
                        : next.add(detail.id);
                      return next;
                    })
                  }
                  type="button"
                >
                  {savedIds.has(detail.id)
                    ? translate("explore.result.saved", "Saved")
                    : translate("explore.result.save", "Save")}
                </button>
                <button
                  className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-primary-foreground text-sm disabled:opacity-60"
                  disabled={chatPending}
                  onClick={() => askKhasiGpt(detail)}
                  type="button"
                >
                  {chatPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <MessageCircle className="size-4" />
                  )}
                  <EditableTranslation
                    defaultText="Ask KhasiGPT"
                    translationKey="explore.result.ask"
                  />
                </button>
                <a
                  className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm"
                  href={detail.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="size-4" />
                  <EditableTranslation
                    defaultText="Source"
                    translationKey="explore.result.source"
                  />
                </a>
              </div>
              <button
                className="w-full cursor-pointer rounded-md border px-3 py-2 text-sm"
                onClick={() => setDetail(null)}
                type="button"
              >
                <EditableTranslation
                  defaultText="Close"
                  translationKey="common.close"
                />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ResultCard({
  result,
  onOpen,
}: {
  result: ExploreResult;
  onOpen: () => void;
}) {
  return (
    <button
      className="group cursor-pointer overflow-hidden rounded-xl border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      onClick={onOpen}
      type="button"
    >
      {result.imageUrl ? (
        <Image
          alt=""
          className="aspect-[16/9] w-full object-cover"
          height={360}
          loading="lazy"
          src={result.imageUrl}
          unoptimized
          width={640}
        />
      ) : (
        <div className="flex aspect-[16/9] items-center justify-center bg-muted">
          <Compass className="size-10 text-muted-foreground/35" />
        </div>
      )}
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-2 font-semibold">{result.name}</h3>
        {result.address ? (
          <p className="line-clamp-2 text-muted-foreground text-sm">
            {result.address}
          </p>
        ) : null}
        <ResultMeta result={result} />
        <p className="truncate text-primary text-xs">{result.sourceTitle}</p>
      </div>
    </button>
  );
}

function ResultMeta({ result }: { result: ExploreResult }) {
  return (
    <div className="flex flex-wrap gap-2 text-muted-foreground text-xs">
      {result.rating !== null ? (
        <span className="inline-flex items-center gap-1">
          <Star className="size-3 fill-current" />
          {result.rating}
          {result.reviewCount !== null ? ` (${result.reviewCount})` : ""}
        </span>
      ) : null}
      {result.distance ? <span>{result.distance}</span> : null}
      {result.openStatus ? <span>{result.openStatus}</span> : null}
      {result.eventDate ? <span>{result.eventDate}</span> : null}
    </div>
  );
}
