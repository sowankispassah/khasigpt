"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { LoaderIcon, PlusIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { getForumSlugBase } from "@/lib/forum/utils";
import { fetchWithErrorHandlers } from "@/lib/utils";

type ForumCategoryManagerProps = {
  className?: string;
};

export function ForumCategoryManager({ className }: ForumCategoryManagerProps) {
  const router = useRouter();
  const { translate } = useTranslation();
  const nameId = useId();
  const slugId = useId();
  const descriptionId = useId();
  const positionId = useId();
  const lockedId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [isSlugDirty, setIsSlugDirty] = useState(false);
  const [description, setDescription] = useState("");
  const [position, setPosition] = useState("0");
  const [isLocked, setIsLocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const derivedSlug = useMemo(() => {
    if (isSlugDirty) {
      return slugInput.trim();
    }
    return getForumSlugBase(name);
  }, [isSlugDirty, name, slugInput]);

  const resetForm = () => {
    setName("");
    setSlugInput("");
    setIsSlugDirty(false);
    setDescription("");
    setPosition("0");
    setIsLocked(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (normalizedName.length < 3) {
      toast.error(
        translate(
          "forum.category_manager.error.name_short",
          "Category name must be at least 3 characters long."
        )
      );
      return;
    }
    if (derivedSlug.length === 0) {
      toast.error(
        translate(
          "forum.category_manager.error.slug_required",
          "Slug cannot be empty."
        )
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await fetchWithErrorHandlers("/api/forum/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalizedName,
          slug: derivedSlug,
          description:
            description.trim().length > 0 ? description.trim() : undefined,
          position: Number.parseInt(position, 10) || 0,
          isLocked,
        }),
      });
      toast.success(
        translate("forum.category_manager.toast.created", "Category created.")
      );
      setOpen(false);
      resetForm();
      router.refresh();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button className={className} variant="outline">
          <PlusIcon />
          {translate("forum.category_manager.button", "Add category")}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {translate(
              "forum.category_manager.sheet_title",
              "Add a new forum category"
            )}
          </SheetTitle>
        </SheetHeader>
        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="font-medium text-sm" htmlFor={nameId}>
              {translate("forum.category_manager.field.name.label", "Name")}
            </label>
            <Input
              id={nameId}
              onChange={(event) => setName(event.target.value)}
              placeholder={translate(
                "forum.category_manager.field.name.placeholder",
                "e.g. Product Help"
              )}
              value={name}
            />
          </div>
          <div className="space-y-2">
            <label className="font-medium text-sm" htmlFor={slugId}>
              {translate("forum.category_manager.field.slug.label", "Slug")}
            </label>
            <Input
              id={slugId}
              onBlur={() => setIsSlugDirty(true)}
              onChange={(event) => {
                setIsSlugDirty(true);
                setSlugInput(event.target.value);
              }}
              placeholder={translate(
                "forum.category_manager.field.slug.placeholder",
                "product-help"
              )}
              value={derivedSlug}
            />
          </div>
          <div className="space-y-2">
            <label className="font-medium text-sm" htmlFor={descriptionId}>
              {translate(
                "forum.category_manager.field.description.label",
                "Description"
              )}
            </label>
            <Textarea
              id={descriptionId}
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={translate(
                "forum.category_manager.field.description.placeholder",
                "Visible on the forum page to describe what belongs here."
              )}
              value={description}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="font-medium text-sm" htmlFor={positionId}>
                {translate(
                  "forum.category_manager.field.position.label",
                  "Position"
                )}
              </label>
              <Input
                id={positionId}
                min={0}
                onChange={(event) => setPosition(event.target.value)}
                type="number"
                value={position}
              />
            </div>
            <div className="space-y-2">
              <label className="font-medium text-sm" htmlFor={lockedId}>
                {translate("forum.category_manager.field.locked.label", "Locked")}
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <input
                  checked={isLocked}
                  className="h-4 w-4 cursor-pointer accent-primary"
                  id={lockedId}
                  onChange={(event) => setIsLocked(event.target.checked)}
                  type="checkbox"
                />
                <span className="text-muted-foreground text-sm">
                  {translate(
                    "forum.category_manager.field.locked.helper",
                    "Prevent new threads in this category"
                  )}
                </span>
              </div>
            </div>
          </div>
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <LoaderIcon className="animate-spin" size={16} />
                {translate(
                  "forum.category_manager.submit_pending",
                  "Saving…"
                )}
              </span>
            ) : (
              translate("forum.category_manager.submit", "Save category")
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
