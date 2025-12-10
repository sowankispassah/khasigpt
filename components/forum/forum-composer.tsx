"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { LoaderIcon, PlusIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useForumActions } from "@/hooks/use-forum-actions";
import { cn } from "@/lib/utils";

type ComposerCategory = {
  id: string;
  slug: string;
  name: string;
  isLocked: boolean;
};

type ComposerTag = {
  id: string;
  slug: string;
  label: string;
};

type ForumComposerProps = {
  categories: ComposerCategory[];
  tags: ComposerTag[];
  viewerId: string | null;
  viewerName: string | null;
};

export function ForumComposer({
  categories,
  tags,
  viewerId,
  viewerName,
}: ForumComposerProps) {
  const router = useRouter();
  const { translate } = useTranslation();
  const titleId = useId();
  const categoryId = useId();
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const [isLoginPromptOpen, setIsLoginPromptOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [categorySlug, setCategorySlug] = useState<string | undefined>(
    categories.find((category) => !category.isLocked)?.slug
  );
  const [content, setContent] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { createThread, isCreatingThread } = useForumActions();

  const availableTags = useMemo(() => tags.slice(0, 12), [tags]);

  const handleToggleTag = (slug: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(slug)) {
        return prev.filter((tag) => tag !== slug);
      }
      if (prev.length >= 5) {
        toast.error(
          translate(
            "forum.composer.error.max_tags",
            "You can only select up to 5 tags."
          )
        );
        return prev;
      }
      return [...prev, slug];
    });
  };

  const validate = useCallback(() => {
    const nextErrors: Record<string, string> = {};
    if (title.trim().length < 8) {
      nextErrors.title = translate(
        "forum.composer.error.title_short",
        "Title must be at least 8 characters long."
      );
    }
    if (!categorySlug) {
      nextErrors.category = translate(
        "forum.composer.error.category_required",
        "Please select a category."
      );
    }
    if (content.trim().length < 24) {
      nextErrors.content = translate(
        "forum.composer.error.content_short",
        "Describe your discussion in more detail."
      );
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [title, categorySlug, content, translate]);

  const resetForm = () => {
    setTitle("");
    setContent("");
    setSelectedTags([]);
    setErrors({});
    setCategorySlug(categories.find((category) => !category.isLocked)?.slug);
  };

  const handleLoginRedirect = () => {
    setIsLoginPromptOpen(false);
    router.push("/login?redirect=/forum");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!viewerId && nextOpen) {
      setIsLoginPromptOpen(true);
      return;
    }
    setOpen(nextOpen);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!viewerId) {
      router.push("/login?redirect=/forum");
      return;
    }
    if (!validate()) {
      return;
    }
    if (!categorySlug) {
      return;
    }
    const payload = {
      title: title.trim(),
      content: content.trim(),
      summary: content.trim().slice(0, 280),
      categorySlug,
      tagSlugs: selectedTags,
    };
    try {
      const thread = await createThread(payload);
      toast.success("Discussion created! Redirecting...");
      setOpen(false);
      resetForm();
      router.push(`/forum/${thread.slug}`);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <>
      <Sheet onOpenChange={handleOpenChange} open={open}>
        <SheetTrigger asChild>
          <Button
            className="inline-flex cursor-pointer items-center gap-2 rounded-full px-6 py-2 font-semibold text-sm"
            title={
              viewerId
                ? undefined
                : translate(
                    "forum.composer.button_tooltip",
                    "Sign in to start a discussion."
                  )
            }
          >
            <PlusIcon />
            {translate("forum.composer.button", "Start a discussion")}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {viewerName
                ? translate(
                    "forum.composer.sheet_title_with_name",
                    "Hi {name}, share an update"
                  ).replace("{name}", (viewerName.split(" ")[0] ?? "").trim())
                : translate("forum.composer.sheet_title", "Start a discussion")}
            </SheetTitle>
          </SheetHeader>
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="font-medium text-sm" htmlFor={titleId}>
                {translate("forum.composer.title.label", "Title")}
              </label>
              <Input
                id={titleId}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={translate(
                  "forum.composer.title.placeholder",
                  "What would you like to discuss?"
                )}
                value={title}
              />
              {errors.title ? (
                <p className="text-destructive text-xs">{errors.title}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="font-medium text-sm" htmlFor={categoryId}>
                {translate("forum.composer.category.label", "Category")}
              </label>
              <Select
                onValueChange={setCategorySlug}
                value={categorySlug ?? undefined}
              >
                <SelectTrigger id={categoryId}>
                  <SelectValue
                    placeholder={translate(
                      "forum.composer.category.placeholder",
                      "Select a category"
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem
                      disabled={category.isLocked}
                      key={category.id}
                      value={category.slug}
                    >
                      {translate(
                        `forum.category.${category.slug}.name`,
                        category.name
                      )}
                      {category.isLocked
                        ? ` ${translate(
                            "forum.composer.category.locked",
                            "(locked)"
                          )}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category ? (
                <p className="text-destructive text-xs">{errors.category}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="font-medium text-sm" htmlFor={detailsId}>
                {translate("forum.composer.details.label", "Details")}{" "}
                <span className="text-muted-foreground text-xs">
                  {translate(
                    "forum.composer.details.note",
                    "(Markdown formatting supported soon)"
                  )}
                </span>
              </label>
              <Textarea
                className="min-h-[160px] resize-none"
                id={detailsId}
                maxLength={4000}
                onChange={(event) => setContent(event.target.value)}
                placeholder={translate(
                  "forum.composer.details.placeholder",
                  "Share the full context, code snippets, or anything that helps the community respond faster."
                )}
                value={content}
              />
              {errors.content ? (
                <p className="text-destructive text-xs">{errors.content}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">
                  {translate("forum.composer.tags.label", "Tags")}
                </p>
                <span className="text-muted-foreground text-xs">
                  {translate(
                    "forum.composer.tags.count",
                    "{count}/5 selected"
                  ).replace("{count}", selectedTags.length.toString())}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag.slug);
                  return (
                    <button
                      className={cn(
                        "cursor-pointer rounded-full border px-3 py-1 text-xs transition",
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30 hover:bg-primary/5"
                      )}
                      key={tag.id}
                      onClick={(event) => {
                        event.preventDefault();
                        handleToggleTag(tag.slug);
                      }}
                      type="button"
                    >
                      #{tag.label}
                    </button>
                  );
                })}
                {availableTags.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {translate(
                      "forum.composer.tags.empty",
                      "No tags available yet."
                    )}
                  </p>
                ) : null}
              </div>
            </div>
            <Button
              className="w-full"
              disabled={isCreatingThread}
              type="submit"
            >
              {isCreatingThread ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderIcon className="animate-spin" size={16} />
                  {translate("forum.composer.submit_pending", "Publishing…")}
                </span>
              ) : (
                translate("forum.composer.submit", "Publish discussion")
              )}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
      <AlertDialog onOpenChange={setIsLoginPromptOpen} open={isLoginPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translate(
                "forum.composer.login_required.title",
                "Sign in to continue"
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {translate(
                "forum.composer.login_required.body",
                "You need to be logged in to start a discussion. Please sign in and then return to the forum."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {translate("forum.composer.login_required.cancel", "Not now")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleLoginRedirect}>
              {translate(
                "forum.composer.login_required.confirm",
                "Go to login"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
