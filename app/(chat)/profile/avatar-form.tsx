"use client";

import { useSession } from "next-auth/react";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSWRConfig } from "swr";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getAvatarColor, getInitials } from "@/components/user-dropdown-menu";

const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
] as const;

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

type AvatarFormProps = {
  initialImage: string | null;
  userName?: string | null;
  userEmail?: string | null;
};

export function AvatarForm({
  initialImage,
  userEmail,
  userName,
}: AvatarFormProps) {
  const { data: sessionData, update } = useSession();
  const { mutate } = useSWRConfig();
  const [preview, setPreview] = useState<string | null>(initialImage);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "upload" | "remove" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { translate } = useTranslation();

  const initials = useMemo(
    () => getInitials(userName, userEmail),
    [userEmail, userName]
  );
  const avatarColor = useMemo(
    () => getAvatarColor(userEmail ?? userName ?? undefined),
    [userEmail, userName]
  );

  useEffect(() => {
    if (!selectedFile) {
      setPreview(initialImage);
    }
  }, [initialImage, selectedFile]);

  useEffect(() => {
    const currentPreview = preview;
    return () => {
      if (currentPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(currentPreview);
      }
    };
  }, [preview]);

  const resetFeedback = () => {
    setMessage(null);
    setMessageType(null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    resetFeedback();

    if (!file) {
      setSelectedFile(null);
      if (!selectedFile) {
        setPreview(initialImage);
      }
      return;
    }

    if (
      !ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])
    ) {
      setSelectedFile(null);
      setMessageType("error");
      setMessage(
        translate(
          "profile.picture.error.file_type",
          "Please choose a PNG, JPG, or WEBP image."
        )
      );
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setSelectedFile(null);
      setMessageType("error");
      setMessage(
        translate(
          "profile.picture.error.file_size",
          "Images must be 2MB or smaller."
        )
      );
      return;
    }

    if (preview?.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
    }

    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleChooseImage = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedFile) {
      setMessageType("error");
      setMessage(
        translate(
          "profile.picture.error.choose_before_upload",
          "Choose an image before uploading."
        )
      );
      return;
    }

    setIsSaving(true);
    setPendingAction("upload");
    resetFeedback();

    const formData = new FormData();
    formData.append("image", selectedFile);

    try {
      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setMessageType("error");
        setMessage(
          body?.cause ??
            body?.message ??
            translate(
              "profile.picture.error.upload_generic",
              "Failed to update profile image. Please try again."
            )
        );
        return;
      }

      const body = (await response.json()) as {
        image: string;
        updatedAt?: string | null;
      };
      const newVersion = body.updatedAt ?? new Date().toISOString();
      setSelectedFile(null);
      setPreview(body.image);
      setMessageType("success");
      setMessage(
        translate("profile.picture.success.upload", "Profile picture updated.")
      );
      const currentVersion = sessionData?.user.imageVersion ?? null;
      const currentKey =
        currentVersion === undefined
          ? null
          : `/api/profile/avatar?v=${encodeURIComponent(currentVersion ?? "none")}`;
      if (currentKey) {
        await mutate(currentKey, undefined, false);
      }
      const nextKey = `/api/profile/avatar?v=${encodeURIComponent(newVersion)}`;
      await mutate(
        nextKey,
        { image: body.image, updatedAt: newVersion },
        false
      );
      await update?.({ user: { imageVersion: newVersion } });
    } catch (error) {
      console.error("Failed to upload profile image", error);
      setMessageType("error");
      setMessage(
        translate(
          "profile.picture.error.unexpected",
          "Unexpected error while uploading image. Please try again."
        )
      );
    } finally {
      setIsSaving(false);
      setPendingAction(null);
    }
  };

  const handleRemove = async () => {
    setIsSaving(true);
    setPendingAction("remove");
    resetFeedback();

    try {
      const response = await fetch("/api/profile/avatar", {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setMessageType("error");
        setMessage(
          body?.cause ??
            body?.message ??
            translate(
              "profile.picture.error.remove_generic",
              "Failed to remove profile image. Please try again."
            )
        );
        return;
      }

      const body = (await response.json()) as {
        image: null;
        updatedAt?: string | null;
      };
      const newVersion = body.updatedAt ?? new Date().toISOString();

      setSelectedFile(null);
      setPreview(null);
      setMessageType("success");
      setMessage(
        translate("profile.picture.success.remove", "Profile picture removed.")
      );
      const currentVersion = sessionData?.user.imageVersion ?? null;
      const currentKey =
        currentVersion === undefined
          ? null
          : `/api/profile/avatar?v=${encodeURIComponent(currentVersion ?? "none")}`;
      if (currentKey) {
        await mutate(currentKey, undefined, false);
      }
      const nextKey = `/api/profile/avatar?v=${encodeURIComponent(newVersion)}`;
      await mutate(nextKey, { image: null, updatedAt: newVersion }, false);
      await update?.({ user: { imageVersion: newVersion } });
    } catch (error) {
      console.error("Failed to remove profile image", error);
      setMessageType("error");
      setMessage(
        translate(
          "profile.picture.error.unexpected_remove",
          "Unexpected error while removing image. Please try again."
        )
      );
    } finally {
      setIsSaving(false);
      setPendingAction(null);
    }
  };

  const showRemoveButton = Boolean(preview);

  return (
    <form className="space-y-4" onSubmit={handleUpload}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar className="h-20 w-20 overflow-hidden">
          <AvatarImage
            alt="Profile picture"
            className="object-cover"
            src={preview ?? undefined}
          />
          <AvatarFallback
            className="font-semibold text-lg text-white uppercase"
            style={{ backgroundColor: avatarColor }}
          >
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-col gap-2">
          <input
            accept={ACCEPTED_TYPES.join(",")}
            className="hidden"
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleChooseImage} type="button" variant="outline">
              {translate("profile.picture.choose", "Choose image")}
            </Button>
            <Button disabled={isSaving || !selectedFile} type="submit">
              {isSaving && pendingAction === "upload" ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin">
                    <LoaderIcon size={16} />
                  </span>
                  <span>
                    {translate("profile.picture.saving", "Saving...")}
                  </span>
                </span>
              ) : selectedFile ? (
                translate("profile.picture.save_changes", "Save changes")
              ) : (
                translate("profile.picture.upload", "Upload")
              )}
            </Button>
            {showRemoveButton ? (
              <Button
                disabled={isSaving}
                onClick={handleRemove}
                type="button"
                variant="ghost"
              >
                {isSaving && pendingAction === "remove" ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin">
                      <LoaderIcon size={16} />
                    </span>
                    <span>
                      {translate("profile.picture.saving", "Saving...")}
                    </span>
                  </span>
                ) : (
                  translate("profile.picture.remove", "Remove")
                )}
              </Button>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">
            {translate(
              "profile.picture.size_help",
              "PNG, JPG, or WEBP up to 2 MB."
            )}
          </p>
        </div>
      </div>

      {message ? (
        <p
          className={`text-xs ${
            messageType === "error" ? "text-destructive" : "text-emerald-600"
          }`}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
