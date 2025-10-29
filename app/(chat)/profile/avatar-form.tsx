"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useSession } from "next-auth/react";
import { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getAvatarColor,
  getInitials,
} from "@/components/user-dropdown-menu";

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
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    let currentPreview = preview;
    return () => {
      if (currentPreview && currentPreview.startsWith("blob:")) {
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

    if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
      setSelectedFile(null);
      setMessageType("error");
      setMessage("Please choose a PNG, JPG, or WEBP image.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setSelectedFile(null);
      setMessageType("error");
      setMessage("Images must be 2MB or smaller.");
      return;
    }

    if (preview && preview.startsWith("blob:")) {
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
      setMessage("Choose an image before uploading.");
      return;
    }

    setIsSaving(true);
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
            "Failed to update profile image. Please try again."
        );
        return;
      }

      const body = (await response.json()) as {
        image: string;
        updatedAt?: string | null;
      };
      const newVersion =
        body.updatedAt ?? new Date().toISOString();
      setSelectedFile(null);
      setPreview(body.image);
      setMessageType("success");
      setMessage("Profile picture updated.");
      const currentVersion = sessionData?.user.imageVersion ?? null;
      const currentKey =
        currentVersion === undefined
          ? null
          : `/api/profile/avatar?v=${encodeURIComponent(currentVersion ?? "none")}`;
      if (currentKey) {
        void mutate(currentKey, undefined, false);
      }
      const nextKey = `/api/profile/avatar?v=${encodeURIComponent(newVersion)}`;
      void mutate(
        nextKey,
        { image: body.image, updatedAt: newVersion },
        false
      );
      await update?.({ user: { imageVersion: newVersion } });
    } catch (error) {
      console.error("Failed to upload profile image", error);
      setMessageType("error");
      setMessage("Unexpected error while uploading image. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsSaving(true);
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
            "Failed to remove profile image. Please try again."
        );
        return;
      }

      const body = (await response.json()) as {
        image: null;
        updatedAt?: string | null;
      };
      const newVersion =
        body.updatedAt ?? new Date().toISOString();

      setSelectedFile(null);
      setPreview(null);
      setMessageType("success");
      setMessage("Profile picture removed.");
      const currentVersion = sessionData?.user.imageVersion ?? null;
      const currentKey =
        currentVersion === undefined
          ? null
          : `/api/profile/avatar?v=${encodeURIComponent(currentVersion ?? "none")}`;
      if (currentKey) {
        void mutate(currentKey, undefined, false);
      }
      const nextKey = `/api/profile/avatar?v=${encodeURIComponent(newVersion)}`;
      void mutate(nextKey, { image: null, updatedAt: newVersion }, false);
      await update?.({ user: { imageVersion: newVersion } });
    } catch (error) {
      console.error("Failed to remove profile image", error);
      setMessageType("error");
      setMessage("Unexpected error while removing image. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const showRemoveButton = Boolean(preview);

  return (
    <form className="space-y-4" onSubmit={handleUpload}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar className="h-20 w-20 overflow-hidden">
          <AvatarImage alt="Profile picture" className="object-cover" src={preview ?? undefined} />
          <AvatarFallback
            className="text-lg font-semibold uppercase text-white"
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
            <Button
              onClick={handleChooseImage}
              type="button"
              variant="outline"
            >
              Choose image
            </Button>
            <Button
              disabled={isSaving || !selectedFile}
              type="submit"
            >
              {isSaving ? "Saving..." : selectedFile ? "Save changes" : "Upload"}
            </Button>
            {showRemoveButton ? (
              <Button
                disabled={isSaving}
                onClick={handleRemove}
                type="button"
                variant="ghost"
              >
                Remove
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            PNG, JPG, or WEBP up to 2 MB.
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
