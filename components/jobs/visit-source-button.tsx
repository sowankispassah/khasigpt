"use client";

import { ExternalLink } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { startGlobalProgress } from "@/lib/ui/global-progress";

type VisitSourceButtonProps = {
  href: string | null;
};

function resolveNavigableSourceUrl(href: string | null) {
  if (!href) {
    return null;
  }

  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function VisitSourceButton({ href }: VisitSourceButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const navigableHref = useMemo(() => resolveNavigableSourceUrl(href), [href]);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setIsOpening(false);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    if (!navigableHref || isOpening) {
      return;
    }

    setIsOpening(true);
    startGlobalProgress();

    window.requestAnimationFrame(() => {
      window.location.assign(navigableHref);
    });
  }, [isOpening, navigableHref]);

  if (!navigableHref) {
    return (
      <Button className="w-full sm:w-auto" disabled size="sm" type="button" variant="outline">
        Source Unavailable
      </Button>
    );
  }

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={isDialogOpen}>
      <AlertDialogTrigger asChild>
        <Button className="w-full sm:w-auto" size="sm" type="button" variant="outline">
          <ExternalLink />
          Visit Source
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Open original source?</AlertDialogTitle>
          <AlertDialogDescription>
            You will leave this page and open the original job source. Continue only if you
            want to visit the external listing directly.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isOpening}>Stay here</AlertDialogCancel>
          <Button disabled={isOpening} onClick={handleConfirm} type="button">
            {isOpening ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin">
                  <LoaderIcon size={16} />
                </span>
                <span>Opening...</span>
              </span>
            ) : (
              "Continue"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
