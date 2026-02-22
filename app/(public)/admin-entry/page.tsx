"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ADMIN_ENTRY_PASS_COOKIE_MAX_AGE_SECONDS } from "@/lib/constants";
import styles from "./admin-entry.module.css";

const DEFAULT_LOGIN_PATH = "/login?callbackUrl=%2Fadmin%2Fsettings";

function normalizeNextPath(rawPath: string | null) {
  if (typeof rawPath !== "string") {
    return DEFAULT_LOGIN_PATH;
  }

  const trimmed = rawPath.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return DEFAULT_LOGIN_PATH;
  }

  return trimmed;
}

function AdminEntryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const nextPath = useMemo(
    () => normalizeNextPath(searchParams?.get("next") ?? null),
    [searchParams]
  );
  const unlockMinutes = Math.floor(ADMIN_ENTRY_PASS_COOKIE_MAX_AGE_SECONDS / 60);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/public/admin-entry/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: unknown }
          | null;
        const message =
          typeof payload?.message === "string" && payload.message.trim().length > 0
            ? payload.message
            : "Failed to verify admin code.";
        setErrorMessage(message);
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setErrorMessage("Could not verify admin code. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <h1 className={styles.title}>Admin Access Verification</h1>
        <p className={styles.subtitle}>
          Enter the admin code to unlock sign in for the next {unlockMinutes}{" "}
          minutes.
        </p>

        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.label} htmlFor="admin-entry-code">
            Access code
          </label>
          <input
            autoComplete="one-time-code"
            className={styles.input}
            id="admin-entry-code"
            onChange={(event) => {
              setCode(event.target.value);
            }}
            placeholder="Enter admin access code"
            required
            type="password"
            value={code}
          />

          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

          <button className={styles.button} disabled={isSubmitting} type="submit">
            {isSubmitting ? "Verifying..." : "Unlock admin sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function AdminEntryPage() {
  return (
    <Suspense fallback={null}>
      <AdminEntryContent />
    </Suspense>
  );
}
