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
  NotebookPen,
  Search,
  Star,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "@/components/language-provider";
import {
  EditableTranslation,
  useEditableTranslation,
} from "@/components/translation-edit-provider";
import {
  createExploreSearchKey,
  extractExploreRadiusKm,
} from "@/lib/explore/shared";
import type {
  ExploreCategoryDto,
  ExploreLocationInput,
  ExploreResult,
  ExploreSearchResponse,
} from "@/lib/explore/types";
import { startGlobalProgress } from "@/lib/ui/global-progress";

const EXPLORE_SESSION_STORAGE_KEY = "explore.locationSession.v2";
const SAVED_RESULTS_STORAGE_KEY = "explore.savedResults";
const DISCOVERY_QUERY =
  "Nearby places, businesses, food, services, attractions and activities";

type SearchSelection = {
  categoryId: string | null;
  query: string;
  subcategoryId: string | null;
};

type StoredExploreSession = {
  categoryId: string | null;
  location: ExploreLocationInput;
  query: string;
  radiusKm: number;
  subcategoryId: string | null;
};

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

function isExploreLocation(value: unknown): value is ExploreLocationInput {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ExploreLocationInput>;
  return (
    typeof item.id === "string" &&
    typeof item.label === "string" &&
    typeof item.latitude === "number" &&
    Number.isFinite(item.latitude) &&
    typeof item.longitude === "number" &&
    Number.isFinite(item.longitude) &&
    (item.source === "gps" || item.source === "manual")
  );
}

function parseStoredSession(value: string | null): StoredExploreSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredExploreSession>;
    if (
      !isExploreLocation(parsed.location) ||
      !Number.isInteger(parsed.radiusKm) ||
      (parsed.radiusKm ?? 0) < 1 ||
      (parsed.radiusKm ?? 0) > 50
    ) {
      return null;
    }
    return {
      categoryId:
        typeof parsed.categoryId === "string" ? parsed.categoryId : null,
      location: parsed.location,
      query: typeof parsed.query === "string" ? parsed.query : "",
      radiusKm: parsed.radiusKm as number,
      subcategoryId:
        typeof parsed.subcategoryId === "string" ? parsed.subcategoryId : null,
    };
  } catch {
    return null;
  }
}

function newRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
      "explore.search.placeholder_location_first",
      "Search restaurants, shops, businesses, events, places...",
      "Placeholder for Explore search after a location is selected.",
    );
  const {
    text: manualLocationPlaceholder,
    editButton: manualLocationPlaceholderEdit,
  } = useEditableTranslation(
    "explore.location.manual_placeholder",
    "Enter a city, town, village or area",
    "Placeholder for manually resolving an Explore Meghalaya location.",
  );
  const [categories, setCategories] = useState(initialCategories ?? []);
  const [categoriesUnavailable, setCategoriesUnavailable] = useState(
    initialCategories === null,
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<
    string | null
  >(null);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<ExploreLocationInput | null>(null);
  const [locationStage, setLocationStage] = useState<
    "choose" | "manual" | "denied"
  >("choose");
  const [sessionRestored, setSessionRestored] = useState(false);
  const [manualLocation, setManualLocation] = useState("");
  const [radiusKm, setRadiusKm] = useState(10);
  const [locationPending, setLocationPending] = useState(false);
  const [manualPending, setManualPending] = useState(false);
  const [searchPending, setSearchPending] = useState(false);
  const [radiusDebouncing, setRadiusDebouncing] = useState(false);
  const [loadingMode, setLoadingMode] = useState<
    "initial" | "location" | "radius" | "search"
  >("search");
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [response, setResponse] = useState<ExploreSearchResponse | null>(null);
  const [lastSearch, setLastSearch] = useState<SearchSelection | null>(null);
  const [detail, setDetail] = useState<ExploreResult | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(SAVED_RESULTS_STORAGE_KEY) ?? "[]",
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
  const abortRef = useRef<AbortController | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);
  const requestedSearchKeyRef = useRef<string | null>(null);
  const restoredSearchRef = useRef<SearchSelection | null>(null);
  const previousRadiusRef = useRef(radiusKm);

  const selectedCategory = useMemo(
    () => categories.find((item) => item.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );
  const selectedSubcategory = useMemo(
    () =>
      selectedCategory?.subcategories.find(
        (item) => item.id === selectedSubcategoryId,
      ) ?? null,
    [selectedCategory, selectedSubcategoryId],
  );

  useEffect(() => {
    const stored = parseStoredSession(
      window.sessionStorage.getItem(EXPLORE_SESSION_STORAGE_KEY),
    );
    if (stored) {
      setLocation(stored.location);
      setRadiusKm(stored.radiusKm);
      setSelectedCategoryId(stored.categoryId);
      setSelectedSubcategoryId(stored.subcategoryId);
      setQuery(stored.query);
      restoredSearchRef.current = {
        categoryId: stored.categoryId,
        query: stored.query || DISCOVERY_QUERY,
        subcategoryId: stored.subcategoryId,
      };
    }
    setSessionRestored(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      SAVED_RESULTS_STORAGE_KEY,
      JSON.stringify(Array.from(savedIds)),
    );
  }, [savedIds]);

  useEffect(() => {
    if (!sessionRestored) return;
    if (!location) {
      window.sessionStorage.removeItem(EXPLORE_SESSION_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(
      EXPLORE_SESSION_STORAGE_KEY,
      JSON.stringify({
        categoryId: selectedCategoryId,
        location,
        query,
        radiusKm,
        subcategoryId: selectedSubcategoryId,
      } satisfies StoredExploreSession),
    );
  }, [
    location,
    query,
    radiusKm,
    selectedCategoryId,
    selectedSubcategoryId,
    sessionRestored,
  ]);

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

  const runSearch = useCallback(
    async ({
      selection,
      radiusOverride,
      mode = "search",
    }: {
      selection: SearchSelection;
      radiusOverride?: number;
      mode?: "initial" | "location" | "radius" | "search";
    }) => {
      if (!location) return;
      const normalized = selection.query.trim();
      if (!normalized) return;
      const requestedRadius =
        radiusOverride ?? extractExploreRadiusKm(normalized) ?? radiusKm;
      if (requestedRadius !== radiusKm) setRadiusKm(requestedRadius);
      const requestId = newRequestId();
      const searchKey = createExploreSearchKey({
        categoryId: selection.categoryId,
        latitude: location.latitude,
        locationId: location.id,
        longitude: location.longitude,
        query: normalized,
        radiusKm: requestedRadius,
        subcategoryId: selection.subcategoryId,
      });
      if (
        searchKey === requestedSearchKeyRef.current &&
        (searchPending || response)
      ) {
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      currentRequestIdRef.current = requestId;
      requestedSearchKeyRef.current = searchKey;
      const previousResponse = response;
      setResponse(null);
      setDetail(null);
      setError(null);
      setLastSearch(selection);
      setLoadingMode(mode);
      setRadiusDebouncing(false);
      setSearchPending(true);
      try {
        const res = await fetch("/api/explore/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: normalized,
            categoryId: selection.categoryId,
            subcategoryId: selection.subcategoryId,
            chatId: previousResponse?.chatId ?? null,
            clientRequestId: requestId,
            locationContextKey: previousResponse?.locationContextKey ?? null,
            location,
            radiusKm: requestedRadius,
          }),
          signal: controller.signal,
        });
        const body = (await res
          .json()
          .catch(() => ({}))) as ExploreSearchResponse & {
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          throw new Error(
            body.message ||
              translate(
                "explore.error.search",
                "Unable to load Explore results right now. Please try again.",
              ),
          );
        }
        if (
          currentRequestIdRef.current !== requestId ||
          body.clientRequestId !== requestId ||
          body.location.id !== location.id ||
          body.radiusKm !== requestedRadius
        ) {
          return;
        }
        setResponse(body);
      } catch (searchError) {
        if (
          searchError instanceof DOMException &&
          searchError.name === "AbortError"
        ) {
          return;
        }
        if (currentRequestIdRef.current !== requestId) return;
        setError(
          searchError instanceof Error
            ? searchError.message
            : translate(
                "explore.error.search",
                "Unable to load Explore results right now. Please try again.",
              ),
        );
      } finally {
        if (currentRequestIdRef.current === requestId) {
          setSearchPending(false);
        }
      }
    },
    [location, radiusKm, response, searchPending, translate],
  );

  useEffect(() => {
    if (!(sessionRestored && location) || lastSearch || searchPending) return;
    const restored = restoredSearchRef.current;
    restoredSearchRef.current = null;
    const selection =
      restored ??
      ({
        categoryId: null,
        query: DISCOVERY_QUERY,
        subcategoryId: null,
      } satisfies SearchSelection);
    setLastSearch(selection);
    void runSearch({
      selection,
      mode: restored ? "initial" : "location",
    });
  }, [lastSearch, location, runSearch, searchPending, sessionRestored]);

  useEffect(() => {
    if (previousRadiusRef.current === radiusKm) return;
    previousRadiusRef.current = radiusKm;
    if (!(location && lastSearch)) return;
    const expectedKey = createExploreSearchKey({
      categoryId: lastSearch.categoryId,
      latitude: location.latitude,
      locationId: location.id,
      longitude: location.longitude,
      query: lastSearch.query,
      radiusKm,
      subcategoryId: lastSearch.subcategoryId,
    });
    if (expectedKey === requestedSearchKeyRef.current) {
      setRadiusDebouncing(false);
      return;
    }
    abortRef.current?.abort();
    currentRequestIdRef.current = null;
    setResponse(null);
    setError(null);
    setRadiusDebouncing(true);
    setLoadingMode("radius");
    const timeout = window.setTimeout(() => {
      void runSearch({
        selection: lastSearch,
        radiusOverride: radiusKm,
        mode: "radius",
      });
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [lastSearch, location, radiusKm, runSearch]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const establishLocation = (nextLocation: ExploreLocationInput) => {
    abortRef.current?.abort();
    currentRequestIdRef.current = null;
    requestedSearchKeyRef.current = null;
    restoredSearchRef.current = null;
    setResponse(null);
    setLastSearch(null);
    setSelectedCategoryId(null);
    setSelectedSubcategoryId(null);
    setQuery("");
    setDetail(null);
    setError(null);
    setLocationError(null);
    setLocation(nextLocation);
    setLocationStage("choose");
  };

  const resolveLocation = async (
    input:
      | { mode: "manual"; query: string }
      | {
          mode: "reverse";
          latitude: number;
          longitude: number;
          accuracy: number | null;
        },
  ) => {
    const res = await fetch("/api/explore/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      location?: ExploreLocationInput;
      message?: string;
    };
    if (!(res.ok && body.location)) {
      throw new Error(
        body.message ||
          translate(
            "explore.location.resolve_error",
            "We couldn't resolve that location. Please try again.",
          ),
      );
    }
    establishLocation(body.location);
  };

  const captureCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setLocationStage("denied");
      setLocationError(
        translate(
          "explore.location.access_failed",
          "We couldn't access your current location.",
        ),
      );
      return;
    }
    setLocationPending(true);
    setLocationError(null);
    if (navigator.permissions) {
      try {
        const permission = await navigator.permissions.query({
          name: "geolocation",
        });
        if (permission.state === "denied") {
          setLocationPending(false);
          setLocationStage("denied");
          setLocationError(
            translate(
              "explore.location.access_failed",
              "We couldn't access your current location.",
            ),
          );
          return;
        }
      } catch {
        // Permissions API support varies; getCurrentPosition remains canonical.
      }
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void resolveLocation({
          mode: "reverse",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
          .catch((locationFailure) => {
            setLocationStage("denied");
            setLocationError(
              locationFailure instanceof Error
                ? locationFailure.message
                : translate(
                    "explore.location.access_failed",
                    "We couldn't access your current location.",
                  ),
            );
          })
          .finally(() => setLocationPending(false));
      },
      () => {
        setLocationPending(false);
        setLocationStage("denied");
        setLocationError(
          translate(
            "explore.location.access_failed",
            "We couldn't access your current location.",
          ),
        );
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 12_000 },
    );
  };

  const submitManualLocation = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = manualLocation.trim();
    if (!normalized || manualPending) return;
    setManualPending(true);
    setLocationError(null);
    try {
      await resolveLocation({ mode: "manual", query: normalized });
      setManualLocation("");
    } catch (manualError) {
      setLocationError(
        manualError instanceof Error
          ? manualError.message
          : translate(
              "explore.location.resolve_error",
              "We couldn't resolve that location. Please try again.",
            ),
      );
    } finally {
      setManualPending(false);
    }
  };

  const changeLocation = () => {
    abortRef.current?.abort();
    window.sessionStorage.removeItem(EXPLORE_SESSION_STORAGE_KEY);
    currentRequestIdRef.current = null;
    requestedSearchKeyRef.current = null;
    setLocation(null);
    setResponse(null);
    setLastSearch(null);
    setQuery("");
    setSelectedCategoryId(null);
    setSelectedSubcategoryId(null);
    setError(null);
    setLocationError(null);
    setLocationStage("choose");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized) return;
    const selection = {
      categoryId: selectedCategoryId,
      query: normalized,
      subcategoryId: selectedSubcategoryId,
    };
    void runSearch({ selection, mode: "search" });
  };

  const runCategorySearch = (category: ExploreCategoryDto) => {
    setSelectedCategoryId(category.id);
    setSelectedSubcategoryId(null);
    setQuery(category.name);
    void runSearch({
      selection: {
        categoryId: category.id,
        query: category.name,
        subcategoryId: null,
      },
      mode: "search",
    });
  };

  const askKhasiGpt = async (result: ExploreResult) => {
    if (!(response?.chatId && location) || chatPending) return;
    setChatPending(true);
    try {
      await fetch("/api/explore/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: response.chatId,
          location,
          radiusKm: response.radiusKm,
          query: lastSearch?.query ?? query,
          category: selectedCategory?.name ?? null,
          subcategory: selectedSubcategory?.name ?? null,
          selectedResult: {
            name: result.name,
            address: result.address,
            sourceUrl: result.sourceUrl,
          },
          results: response.results.map((item) => ({
            name: item.name,
            address: item.address,
            distanceKm: item.distanceKm,
            sourceUrl: item.sourceUrl,
          })),
        }),
      });
    } finally {
      startGlobalProgress();
      router.push(`/chat/${response.chatId}`);
    }
  };

  if (!sessionRestored) {
    return (
      <main className="mx-auto flex min-h-[50vh] w-full max-w-3xl items-center justify-center p-4">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!location) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-24 md:p-8">
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
              defaultText="First, choose your location to discover what's around you."
              description="Location-first Explore Meghalaya entry instruction."
              translationKey="explore.location.first_instruction"
            />
          </p>
        </header>

        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm md:p-7">
          {locationStage === "choose" ? (
            <>
              <button
                className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                disabled={locationPending}
                onClick={() => void captureCurrentLocation()}
                type="button"
              >
                {locationPending ? (
                  <LoaderCircle className="size-5 animate-spin" />
                ) : (
                  <LocateFixed className="size-5" />
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
              <button
                className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border px-5 font-semibold"
                disabled={locationPending}
                onClick={() => setLocationStage("manual")}
                type="button"
              >
                <NotebookPen className="size-5" />
                <EditableTranslation
                  defaultText="Enter Location Manually"
                  translationKey="explore.location.enter_manually"
                />
              </button>
            </>
          ) : null}

          {locationStage === "manual" ? (
            <form className="space-y-4" onSubmit={submitManualLocation}>
              <label className="block space-y-2">
                <span className="font-medium">
                  <EditableTranslation
                    defaultText="Enter a city, town, village or area"
                    translationKey="explore.location.manual_label"
                  />
                </span>
                <div className="relative">
                  <MapPin className="absolute top-3.5 left-3 size-5 text-muted-foreground" />
                  <input
                    aria-label={manualLocationPlaceholder}
                    className="min-h-12 w-full rounded-xl border bg-background pr-3 pl-10 outline-none focus:ring-2 focus:ring-primary/30"
                    onChange={(event) => setManualLocation(event.target.value)}
                    placeholder={manualLocationPlaceholder}
                    value={manualLocation}
                  />
                  {manualLocationPlaceholderEdit}
                </div>
              </label>
              <p className="text-muted-foreground text-sm">
                <EditableTranslation
                  defaultText="Examples: Shangpung, Jowai, Shillong, Sohra, Tura or Nongpoh."
                  translationKey="explore.location.manual_examples"
                />
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={manualPending || !manualLocation.trim()}
                  type="submit"
                >
                  {manualPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <MapPin className="size-4" />
                  )}
                  <EditableTranslation
                    defaultText={
                      manualPending ? "Finding location..." : "Use location"
                    }
                    translationKey={
                      manualPending
                        ? "explore.location.finding"
                        : "explore.location.use_manual"
                    }
                  />
                </button>
                <button
                  className="min-h-11 cursor-pointer rounded-xl border px-4"
                  disabled={manualPending}
                  onClick={() => {
                    setLocationStage("choose");
                    setLocationError(null);
                  }}
                  type="button"
                >
                  <EditableTranslation
                    defaultText="Back"
                    translationKey="common.back"
                  />
                </button>
              </div>
            </form>
          ) : null}

          {locationStage === "denied" ? (
            <div className="space-y-4">
              <p className="font-medium text-destructive">
                <EditableTranslation
                  defaultText="We couldn't access your current location."
                  translationKey="explore.location.access_failed"
                />
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60"
                  disabled={locationPending}
                  onClick={() => void captureCurrentLocation()}
                  type="button"
                >
                  {locationPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <LocateFixed className="size-4" />
                  )}
                  <EditableTranslation
                    defaultText="Try Again"
                    translationKey="common.try_again"
                  />
                </button>
                <button
                  className="min-h-11 cursor-pointer rounded-xl border px-4 font-medium"
                  disabled={locationPending}
                  onClick={() => setLocationStage("manual")}
                  type="button"
                >
                  <EditableTranslation
                    defaultText="Enter Location Manually"
                    translationKey="explore.location.enter_manually"
                  />
                </button>
              </div>
            </div>
          ) : null}

          {locationError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
              {locationError}
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  const isLoading = searchPending || radiusDebouncing;

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
            defaultText="Discover places, businesses, food, events and experiences around your selected location."
            description="Explore Meghalaya location-first page subtitle."
            translationKey="explore.subtitle_location_first"
          />
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="size-5 shrink-0 text-primary" />
            <strong className="truncate">{location.label}</strong>
          </div>
          <button
            className="min-h-10 cursor-pointer rounded-full border px-4 text-sm"
            disabled={isLoading}
            onClick={changeLocation}
            type="button"
          >
            <EditableTranslation
              defaultText="Change location"
              translationKey="explore.location.change"
            />
          </button>
        </div>

        <div className="rounded-xl border bg-background p-3">
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <EditableTranslation
              defaultText="Search radius"
              translationKey="explore.location.radius"
            />
            <strong className="tabular-nums">
              {translate(
                "explore.location.radius_value",
                "{distance} km",
              ).replace("{distance}", String(radiusKm))}
            </strong>
          </div>
          <input
            aria-label={translate("explore.location.radius", "Search radius")}
            className="h-6 w-full cursor-pointer accent-primary"
            max={50}
            min={1}
            onChange={(event) => setRadiusKm(Number(event.target.value))}
            step={1}
            type="range"
            value={radiusKm}
          />
          <div className="flex justify-between text-muted-foreground text-xs">
            <span>1 km</span>
            <span>10 km</span>
            <span>25 km</span>
            <span>50 km</span>
          </div>
        </div>

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
            disabled={isLoading || !query.trim()}
            type="submit"
          >
            {searchPending && loadingMode === "search" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            <EditableTranslation
              defaultText={
                searchPending && loadingMode === "search"
                  ? "Finding places..."
                  : "Search"
              }
              translationKey={
                searchPending && loadingMode === "search"
                  ? "explore.search.searching"
                  : "explore.search.submit_location_first"
              }
            />
          </button>
        </form>
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

      {categories.length ? (
        <section className="space-y-3">
          <h2 className="font-semibold text-xl">
            <EditableTranslation
              defaultText="Explore Around You"
              translationKey="explore.categories.around_you"
            />
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => {
              const selected = selectedCategoryId === category.id;
              return (
                <button
                  className={`min-h-24 cursor-pointer rounded-xl border p-4 text-left transition hover:border-primary/50 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "border-primary bg-primary/5" : "bg-card"}`}
                  disabled={isLoading}
                  key={category.id}
                  onClick={() => runCategorySearch(category)}
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
          </div>
        </section>
      ) : null}

      {selectedCategory ? (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="font-semibold text-lg">{selectedCategory.name}</h2>
          <div className="flex flex-wrap gap-2">
            {selectedCategory.subcategories.map((subcategory) => (
              <button
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm hover:bg-muted disabled:opacity-60"
                disabled={isLoading}
                key={subcategory.id}
                onClick={() => {
                  setSelectedSubcategoryId(subcategory.id);
                  setQuery(subcategory.name);
                  void runSearch({
                    selection: {
                      categoryId: selectedCategory.id,
                      query: subcategory.name,
                      subcategoryId: subcategory.id,
                    },
                    mode: "search",
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
                  className="cursor-pointer rounded-full bg-muted px-3 py-2 text-sm disabled:opacity-60"
                  disabled={isLoading}
                  key={prompt}
                  onClick={() => {
                    setQuery(prompt);
                    void runSearch({
                      selection: {
                        categoryId: selectedCategory.id,
                        query: prompt,
                        subcategoryId: selectedSubcategoryId,
                      },
                      mode: "search",
                    });
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
            disabled={isLoading || !lastSearch}
            onClick={() =>
              lastSearch &&
              runSearch({ selection: lastSearch, mode: "search" })
            }
            type="button"
          >
            <EditableTranslation
              defaultText="Retry"
              translationKey="common.retry"
            />
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <section className="space-y-4" aria-live="polite">
          <div className="flex items-center gap-2 text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {loadingMode === "radius" ? (
              <EditableTranslation
                defaultText="Updating results..."
                translationKey="explore.loading.radius"
              />
            ) : loadingMode === "location" ? (
              <>
                <EditableTranslation
                  defaultText="Finding places around"
                  translationKey="explore.loading.location"
                />{" "}
                {location.label}...
              </>
            ) : loadingMode === "initial" ? (
              <EditableTranslation
                defaultText="Finding places around you..."
                translationKey="explore.loading.initial"
              />
            ) : (
              <EditableTranslation
                defaultText="Finding places..."
                translationKey="explore.search.searching"
              />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div
                className="h-64 animate-pulse rounded-xl bg-muted"
                key={item}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!isLoading && response ? (
        <section className="space-y-4">
          <div>
            <h2 className="font-semibold text-xl">
              <EditableTranslation
                defaultText="Around"
                translationKey="explore.results.around"
              />{" "}
              {response.location.label}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {translate(
                "explore.location.within_km",
                "Within {distance} km",
              ).replace("{distance}", String(response.radiusKm))}
              {" · "}
              {response.answer}
            </p>
          </div>
          {response.results.length === 0 ? (
            <EmptyResults
              changeLocation={changeLocation}
              location={response.location}
              onIncrease={(nextRadius) => setRadiusKm(nextRadius)}
              radiusKm={response.radiusKm}
              translate={translate}
            />
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

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-background shadow-xl">
            {detail.imageUrl ? (
              <Image
                alt={detail.name}
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
              <ResultAttributions result={detail} />
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

function EmptyResults({
  changeLocation,
  location,
  onIncrease,
  radiusKm,
  translate,
}: {
  changeLocation: () => void;
  location: ExploreLocationInput;
  onIncrease: (radiusKm: number) => void;
  radiusKm: number;
  translate: (key: string, fallback: string) => string;
}) {
  const suggestions = [10, 25].filter((value) => value > radiusKm);
  return (
    <div className="space-y-4 rounded-xl border border-dashed p-6 text-center">
      <p className="text-muted-foreground">
        {translate(
          "explore.results.empty_location",
          "No results found within {distance} km of {location}.",
        )
          .replace("{distance}", String(radiusKm))
          .replace("{location}", location.label)}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((distance) => (
          <button
            className="min-h-10 cursor-pointer rounded-full border px-4 text-sm"
            key={distance}
            onClick={() => onIncrease(distance)}
            type="button"
          >
            {translate(
              "explore.results.increase_radius",
              "Increase to {distance} km",
            ).replace("{distance}", String(distance))}
          </button>
        ))}
        <button
          className="min-h-10 cursor-pointer rounded-full border px-4 text-sm"
          onClick={changeLocation}
          type="button"
        >
          <EditableTranslation
            defaultText="Change Location"
            translationKey="explore.location.change"
          />
        </button>
      </div>
    </div>
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
    <article className="group overflow-hidden rounded-xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <button
        className="w-full cursor-pointer text-left"
        onClick={onOpen}
        type="button"
      >
        {result.imageUrl ? (
          <Image
            alt={result.name}
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
        <div className="space-y-2 p-4 pb-2">
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
      <div className="px-4 pb-4">
        <ResultAttributions result={result} />
      </div>
    </article>
  );
}

function ResultAttributions({ result }: { result: ExploreResult }) {
  if (!result.attributions.length) return null;
  return (
    <p className="text-muted-foreground text-[10px]">
      {result.attributions.map((attribution, index) => (
        <span key={`${attribution.displayName}:${attribution.uri ?? index}`}>
          {index ? " · " : ""}
          {attribution.uri ? (
            <a
              className="cursor-pointer underline"
              href={attribution.uri}
              onClick={(event) => event.stopPropagation()}
              rel="noreferrer"
              target="_blank"
            >
              {attribution.displayName}
            </a>
          ) : (
            attribution.displayName
          )}
        </span>
      ))}
    </p>
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
      <span>{result.distance}</span>
      {result.openStatus ? <span>{result.openStatus}</span> : null}
      {result.eventDate ? <span>{result.eventDate}</span> : null}
    </div>
  );
}
