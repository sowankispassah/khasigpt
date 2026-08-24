"use client";

import { ChevronDown, ChevronUp, Compass, icons, LoaderCircle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  ExploreCategoryDto,
  ExploreLocationMode,
  ExploreResultType,
  ExploreSearchType,
  ExploreSubcategoryDto,
} from "@/lib/explore/types";

type EditorState =
  | { kind: "category"; value: ExploreCategoryDto | null }
  | { kind: "subcategory"; category: ExploreCategoryDto; value: ExploreSubcategoryDto | null }
  | null;

const SEARCH_TYPES: Array<{ value: ExploreSearchType; label: string }> = [
  { value: "local", label: "Local / Places Search" },
  { value: "web", label: "Web Search" },
  { value: "hybrid", label: "Hybrid" },
];
const LOCATION_MODES: Array<{ value: ExploreLocationMode; label: string }> = [
  { value: "current_preferred", label: "Current Location Preferred" },
  { value: "selected", label: "Selected Location" },
  { value: "meghalaya_wide", label: "Meghalaya Wide" },
  { value: "current_or_selected", label: "Current or Selected Location" },
];
const RESULT_TYPES: ExploreResultType[] = ["business", "place", "restaurant", "event", "sports", "experience", "standard"];
const ICON_NAMES = Object.keys(icons).filter((name) => /^[A-Z]/.test(name));

function IconPreview({ name, className = "size-5" }: { name: string; className?: string }) {
  const Icon = (icons as Record<string, typeof Compass>)[name] ?? Compass;
  return <Icon className={className} />;
}

async function mutate(body: unknown) {
  const response = await fetch("/api/admin/explore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("The Explore configuration could not be saved.");
}

export function ExploreAdminManager({ initialCategories }: { initialCategories: ExploreCategoryDto[] | null }) {
  const [categories, setCategories] = useState(initialCategories ?? []);
  const [unavailable, setUnavailable] = useState(initialCategories === null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = async () => {
    setPending("refresh");
    setStatus(null);
    try {
      const response = await fetch("/api/admin/explore", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { categories: ExploreCategoryDto[] };
      setCategories(data.categories);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
      setStatus("Explore configuration is temporarily unavailable.");
    } finally {
      setPending(null);
    }
  };

  const remove = async (kind: "category" | "subcategory", id: string) => {
    if (!window.confirm(`Delete this ${kind}? This cannot be undone.`)) return;
    setPending(`delete:${id}`);
    try {
      await mutate({ action: kind === "category" ? "delete_category" : "delete_subcategory", id });
      await refresh();
      setStatus(`${kind === "category" ? "Category" : "Subcategory"} deleted.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Delete failed.");
      setPending(null);
    }
  };

  const move = async (kind: "category" | "subcategory", categoryId: string | null, id: string, direction: -1 | 1) => {
    const source = kind === "category" ? categories : categories.find((item) => item.id === categoryId)?.subcategories ?? [];
    const index = source.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= source.length) return;
    const reordered = [...source];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setPending(`reorder:${id}`);
    try {
      await mutate({ action: "reorder", kind, ids: reordered.map((item) => item.id) });
      await refresh();
      setStatus("Display order updated.");
    } catch {
      setStatus("Display order could not be updated.");
      setPending(null);
    }
  };

  if (unavailable) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <p className="text-amber-800 text-sm">Explore configuration could not be confirmed. Existing data has not been replaced with an empty list.</p>
        <button className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm" disabled={pending === "refresh"} onClick={refresh} type="button">
          {pending === "refresh" ? <LoaderCircle className="size-4 animate-spin" /> : null} Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{categories.length} categories configured</p>
        <button className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm" onClick={() => setEditor({ kind: "category", value: null })} type="button">
          <Plus className="size-4" /> Add Category
        </button>
      </div>
      {status ? <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{status}</p> : null}
      {categories.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">No categories yet. Add the first admin-managed Explore category.</div>
      ) : (
        <div className="space-y-4">
          {categories.map((category, categoryIndex) => (
            <details className="overflow-hidden rounded-lg border bg-card" key={category.id} open={categoryIndex === 0}>
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                <IconPreview name={category.iconName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{category.name}</p>
                  <p className="truncate text-muted-foreground text-xs">{category.searchType} · {category.locationMode} · {category.resultType}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${category.isEnabled ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{category.isEnabled ? "Enabled" : "Disabled"}</span>
                <span className="text-muted-foreground text-xs">{category.subcategories.length} subcategories</span>
              </summary>
              <div className="space-y-4 border-t p-4">
                <div className="flex flex-wrap gap-2">
                  <button className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-2 text-sm" onClick={() => setEditor({ kind: "category", value: category })} type="button"><Pencil className="size-4" /> Edit</button>
                  <button className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-2 text-sm" disabled={categoryIndex === 0 || pending !== null} onClick={() => move("category", null, category.id, -1)} type="button"><ChevronUp className="size-4" /> Up</button>
                  <button className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-2 text-sm" disabled={categoryIndex === categories.length - 1 || pending !== null} onClick={() => move("category", null, category.id, 1)} type="button"><ChevronDown className="size-4" /> Down</button>
                  <button className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-destructive/40 px-3 py-2 text-destructive text-sm" disabled={pending !== null} onClick={() => remove("category", category.id)} type="button"><Trash2 className="size-4" /> Delete</button>
                  <button className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-2 text-primary-foreground text-sm" onClick={() => setEditor({ kind: "subcategory", category, value: null })} type="button"><Plus className="size-4" /> Add Subcategory</button>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 font-medium"><IconPreview name={category.iconName} /> {category.name}</div>
                  {category.description ? <p className="mt-1 text-muted-foreground text-sm">{category.description}</p> : null}
                  <p className="mt-2 text-xs">{category.subcategories.map((item) => item.name).join(" · ") || "No subcategories"}</p>
                </div>
                {category.subcategories.map((subcategory, index) => (
                  <div className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2" key={subcategory.id}>
                    <IconPreview className="size-4" name={subcategory.iconName} />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm">{subcategory.name}</p><p className="truncate text-muted-foreground text-xs">{subcategory.searchQuery}</p></div>
                    <span className="text-xs">{subcategory.isEnabled ? "Enabled" : "Disabled"}</span>
                    <button className="cursor-pointer rounded border p-2" aria-label="Move subcategory up" disabled={index === 0 || pending !== null} onClick={() => move("subcategory", category.id, subcategory.id, -1)} type="button"><ChevronUp className="size-4" /></button>
                    <button className="cursor-pointer rounded border p-2" aria-label="Move subcategory down" disabled={index === category.subcategories.length - 1 || pending !== null} onClick={() => move("subcategory", category.id, subcategory.id, 1)} type="button"><ChevronDown className="size-4" /></button>
                    <button className="cursor-pointer rounded border p-2" aria-label="Edit subcategory" onClick={() => setEditor({ kind: "subcategory", category, value: subcategory })} type="button"><Pencil className="size-4" /></button>
                    <button className="cursor-pointer rounded border border-destructive/40 p-2 text-destructive" aria-label="Delete subcategory" disabled={pending !== null} onClick={() => remove("subcategory", subcategory.id)} type="button"><Trash2 className="size-4" /></button>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
      {editor ? <ExploreEditor editor={editor} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await refresh(); setStatus("Explore configuration saved."); }} /> : null}
    </>
  );
}

function ExploreEditor({ editor, onClose, onSaved }: { editor: Exclude<EditorState, null>; onClose: () => void; onSaved: () => Promise<void> }) {
  const isCategory = editor.kind === "category";
  const current = editor.value;
  const [iconSearch, setIconSearch] = useState(current?.iconName ?? "Compass");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iconMatches = useMemo(() => ICON_NAMES.filter((name) => name.toLowerCase().includes(iconSearch.toLowerCase())).slice(0, 40), [iconSearch]);

  const submit = async (formData: FormData) => {
    setPending(true);
    setError(null);
    const prompts = String(formData.get("suggestedPrompts") ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
    const base = {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      iconName: String(formData.get("iconName") ?? "Compass"),
      searchQuery: String(formData.get("searchQuery") ?? ""),
      isEnabled: formData.get("isEnabled") === "on",
      displayOrder: Number(formData.get("displayOrder") ?? 0),
    };
    const value = isCategory ? {
      ...base,
      searchType: String(formData.get("searchType")),
      locationMode: String(formData.get("locationMode")),
      resultType: String(formData.get("resultType")),
      suggestedPrompts: prompts,
      showOnHome: formData.get("showOnHome") === "on",
    } : {
      ...base,
      categoryId: editor.category.id,
      searchTypeOverride: String(formData.get("searchTypeOverride") ?? "") || null,
      locationModeOverride: String(formData.get("locationModeOverride") ?? "") || null,
    };
    try {
      await mutate({ action: `${current ? "update" : "create"}_${isCategory ? "category" : "subcategory"}`, ...(current ? { id: current.id } : {}), value });
      await onSaved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Save failed.");
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <form action={submit} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border bg-background p-5 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="font-semibold text-xl">{current ? "Edit" : "Add"} {isCategory ? "Category" : "Subcategory"}</h2><button className="cursor-pointer rounded-md border px-3 py-1.5 text-sm" disabled={pending} onClick={onClose} type="button">Close</button></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Name"><input className="rounded-md border bg-background px-3 py-2" defaultValue={current?.name ?? ""} name="name" required /></Field>
          <Field label="Display order"><input className="rounded-md border bg-background px-3 py-2" defaultValue={current?.displayOrder ?? 0} min={0} name="displayOrder" type="number" /></Field>
          <Field className="md:col-span-2" label="Description"><textarea className="min-h-20 rounded-md border bg-background px-3 py-2" defaultValue={current?.description ?? ""} name="description" /></Field>
          <Field className="md:col-span-2" label="Internal search query"><input className="rounded-md border bg-background px-3 py-2" defaultValue={current?.searchQuery ?? ""} name="searchQuery" required /></Field>
          <Field className="md:col-span-2" label="Icon"><div className="flex items-center gap-2"><IconPreview name={iconSearch} /><input className="flex-1 rounded-md border bg-background px-3 py-2" list="explore-icons" name="iconName" onChange={(event) => setIconSearch(event.target.value)} value={iconSearch} /><Search className="size-4" /></div><datalist id="explore-icons">{iconMatches.map((name) => <option key={name} value={name} />)}</datalist><div className="mt-2 flex flex-wrap gap-1">{iconMatches.slice(0, 12).map((name) => <button className="cursor-pointer rounded border p-2" key={name} onClick={() => setIconSearch(name)} title={name} type="button"><IconPreview className="size-4" name={name} /></button>)}</div></Field>
          {isCategory ? <>
            <Field label="Search type"><select className="rounded-md border bg-background px-3 py-2" defaultValue={(current as ExploreCategoryDto | null)?.searchType ?? "hybrid"} name="searchType">{SEARCH_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
            <Field label="Location behavior"><select className="rounded-md border bg-background px-3 py-2" defaultValue={(current as ExploreCategoryDto | null)?.locationMode ?? "current_or_selected"} name="locationMode">{LOCATION_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
            <Field label="Result layout"><select className="rounded-md border bg-background px-3 py-2 capitalize" defaultValue={(current as ExploreCategoryDto | null)?.resultType ?? "standard"} name="resultType">{RESULT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
            <Field className="md:col-span-2" label="Suggested prompts (one per line)"><textarea className="min-h-24 rounded-md border bg-background px-3 py-2" defaultValue={(current as ExploreCategoryDto | null)?.suggestedPrompts.join("\n") ?? ""} name="suggestedPrompts" /></Field>
            <label className="flex cursor-pointer items-center gap-2"><input defaultChecked={(current as ExploreCategoryDto | null)?.showOnHome ?? true} name="showOnHome" type="checkbox" /> Show on Explore home</label>
          </> : <>
            <Field label="Search type override"><select className="rounded-md border bg-background px-3 py-2" defaultValue={(current as ExploreSubcategoryDto | null)?.searchTypeOverride ?? ""} name="searchTypeOverride"><option value="">Use parent</option>{SEARCH_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
            <Field label="Location override"><select className="rounded-md border bg-background px-3 py-2" defaultValue={(current as ExploreSubcategoryDto | null)?.locationModeOverride ?? ""} name="locationModeOverride"><option value="">Use parent</option>{LOCATION_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
          </>}
          <label className="flex cursor-pointer items-center gap-2"><input defaultChecked={current?.isEnabled ?? true} name="isEnabled" type="checkbox" /> Enabled</label>
        </div>
        {error ? <p className="mt-4 text-destructive text-sm">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2"><button className="cursor-pointer rounded-md border px-4 py-2 text-sm" disabled={pending} onClick={onClose} type="button">Cancel</button><button className="inline-flex min-w-28 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm" disabled={pending} type="submit">{pending ? <><LoaderCircle className="size-4 animate-spin" /> Saving...</> : "Save"}</button></div>
      </form>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <fieldset className={`flex flex-col gap-1 border-0 p-0 text-sm ${className}`}><legend className="font-medium">{label}</legend>{children}</fieldset>;
}
