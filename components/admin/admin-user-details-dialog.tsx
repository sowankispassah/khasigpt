"use client";

import { Loader2, Maximize2, Minimize2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ContactAccountPanel } from "@/components/admin/contact-account-panel";
import type { UserUpdatePayload } from "@/components/admin-user-actions-menu";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  type AdminUserDetails,
  supportConversationUrl,
  supportHistorySchema,
  supportPageSize,
  type UserSupportHistory,
  userDetailsSchema,
} from "@/lib/admin/user-details";
import { fetchWithResponseTimeout } from "@/lib/utils/async";

function Text({ name, fallback }: { name: string; fallback: string }) {
  return (
    <EditableTranslation
      defaultText={fallback}
      description={`Admin user details: ${fallback}`}
      translationKey={`admin.users.details.${name}`}
    />
  );
}
function Field({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">
        <Text fallback={label} name={name} />
      </dt>
      <dd className="mt-1 break-words text-sm">{children ?? "—"}</dd>
    </div>
  );
}
function DateValue({ value }: { value: string | null }) {
  return value ? <time dateTime={value}>{new Date(value).toLocaleString()}</time> : "—";
}
function Busy() {
  return (
    <output className="flex items-center gap-2 text-muted-foreground text-sm">
      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      <Text fallback="Loading..." name="pending" />
    </output>
  );
}
function Retry({ busy, onRetry }: { busy: boolean; onRetry: () => void }) {
  return (
    <Button
      className="mt-2 cursor-pointer"
      disabled={busy}
      onClick={onRetry}
      size="sm"
      variant="outline"
    >
      {busy ? <Loader2 aria-hidden="true" className="mr-1 size-3 animate-spin" /> : null}
      <Text fallback="Retry" name="retry" />
    </Button>
  );
}

export default function AdminUserDetailsDialog({
  userId,
  email,
  onClose,
  onUpdated,
}: {
  userId: string;
  email: string;
  onClose: () => void;
  onUpdated?: (patch: UserUpdatePayload) => void;
}) {
  const router = useRouter();
  const { translate } = useTranslation();
  const [fullscreen, setFullscreen] = useState(false);
  const [details, setDetails] = useState<AdminUserDetails | null>(null);
  const [accountBusy, setAccountBusy] = useState(true);
  const [accountError, setAccountError] = useState(false);
  const [missing, setMissing] = useState(false);
  const [support, setSupport] = useState<UserSupportHistory | null>(null);
  const [supportBusy, setSupportBusy] = useState(true);
  const [supportError, setSupportError] = useState(false);
  const accountRequest = useRef(0);
  const supportRequest = useRef(0);
  const offset = useRef(0);

  const loadAccount = useCallback(async () => {
    const request = ++accountRequest.current;
    setAccountBusy(true);
    setAccountError(false);
    setMissing(false);
    try {
      const data = await fetchWithResponseTimeout(
        `/api/admin/users/${userId}/details`,
        { cache: "no-store" },
        10000,
        async (response) => {
          if (response.status === 404) return null;
          if (!response.ok) throw new Error("Account unavailable");
          return userDetailsSchema.parse(await response.json());
        },
      );
      if (request === accountRequest.current) {
        setDetails(data);
        setMissing(data === null);
      }
    } catch {
      if (request === accountRequest.current) setAccountError(true);
    } finally {
      if (request === accountRequest.current) setAccountBusy(false);
    }
  }, [userId]);
  const loadSupport = useCallback(
    async (pageOffset: number) => {
      const request = ++supportRequest.current;
      offset.current = pageOffset;
      setSupportBusy(true);
      setSupportError(false);
      try {
        const data = await fetchWithResponseTimeout(
          `/api/admin/users/${userId}/details?section=support&offset=${pageOffset}`,
          { cache: "no-store" },
          10000,
          async (response) => {
            if (!response.ok) throw new Error("Support unavailable");
            return supportHistorySchema.parse(await response.json());
          },
        );
        if (request === supportRequest.current) setSupport(data);
      } catch {
        if (request === supportRequest.current) setSupportError(true);
      } finally {
        if (request === supportRequest.current) setSupportBusy(false);
      }
    },
    [userId],
  );
  useEffect(() => {
    void loadAccount();
    void loadSupport(0);
    return () => {
      accountRequest.current++;
      supportRequest.current++;
    };
  }, [loadAccount, loadSupport]);
  const refreshAccount = () => {
    router.refresh();
    void loadAccount();
  };
  const statusLabels = {
    new: ["admin.contacts.status.new", "New"],
    in_progress: ["admin.reports.status.in_review", "In review"],
    resolved: ["admin.contacts.status.resolved", "Resolved"],
    archived: ["admin.reports.status.dismissed", "Dismissed"],
  } as const;
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent
        className={`flex flex-col gap-0 overflow-hidden p-0 ${fullscreen ? "left-0 top-0 h-dvh w-dvw max-w-none translate-x-0 translate-y-0 rounded-none sm:rounded-none" : "h-[min(90dvh,900px)] w-[calc(100vw-2rem)] max-w-6xl"}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b p-5">
          <div>
            <DialogTitle>
              <Text fallback="User details" name="title" />
            </DialogTitle>
            <DialogDescription className="mt-1 break-all">{email}</DialogDescription>
          </div>
          <div className="flex gap-2">
            <Button
              aria-label={translate(
                fullscreen
                  ? "admin.contacts.conversation.restore"
                  : "admin.contacts.conversation.fullscreen",
                fullscreen ? "Restore popup size" : "Full screen",
              )}
              className="cursor-pointer"
              onClick={() => setFullscreen((value) => !value)}
              size="icon"
              variant="outline"
            >
              {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
            <Button
              aria-label={translate("admin.contacts.dialog.close", "Close")}
              className="cursor-pointer"
              onClick={onClose}
              size="icon"
              variant="outline"
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>
        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[280px_minmax(0,1fr)_minmax(300px,1fr)] lg:overflow-hidden">
          <aside className="space-y-3 border-b p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            {accountBusy ? <Busy /> : null}
            {missing ? (
              <p role="alert">
                <Text fallback="This user account no longer exists." name="missing" />
              </p>
            ) : null}
            {accountError ? (
              <div role="alert">
                <Text
                  fallback="User details could not be loaded. Previously loaded details may be out of date."
                  name="error"
                />
                <Retry busy={accountBusy} onRetry={() => void loadAccount()} />
              </div>
            ) : null}
            {details ? (
              <ContactAccountPanel
                account={details.account}
                currentAdminId={details.currentAdminId}
                onRefresh={refreshAccount}
                onUpdated={(patch) => {
                  setDetails((current) =>
                    current ? { ...current, account: { ...current.account, ...patch } } : null,
                  );
                  onUpdated?.(patch);
                  refreshAccount();
                }}
                refreshing={accountBusy || accountError}
                showContactContext={false}
              />
            ) : null}
          </aside>
          <section className="space-y-5 border-b p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <h3 className="font-semibold">
              <Text fallback="Profile and activity" name="profile" />
            </h3>
            {details ? (
              <dl className="space-y-4">
                <Field label="User ID" name="id">
                  {details.account.id}
                </Field>
                <Field label="Date of birth" name="birth">
                  {details.profile.dateOfBirth}
                </Field>
                <Field label="Profile updated" name="updated">
                  <DateValue value={details.profile.updatedAt} />
                </Field>
                <Field label="Personal knowledge access" name="knowledge">
                  <Text
                    fallback={details.account.allowPersonalKnowledge ? "Enabled" : "Disabled"}
                    name={details.account.allowPersonalKnowledge ? "enabled" : "disabled"}
                  />
                </Field>
                {details.activityUnavailable ? (
                  <div role="alert">
                    <Text fallback="Activity details are unavailable." name="activity_error" />
                    <Retry busy={accountBusy} onRetry={() => void loadAccount()} />
                  </div>
                ) : (
                  <>
                    <Field label="Last sign-in" name="login">
                      <DateValue value={details.activity?.lastLoginAt ?? null} />
                    </Field>
                    <Field label="Last seen" name="seen">
                      <DateValue value={details.activity?.lastSeenAt ?? null} />
                    </Field>
                    <Field label="Last page" name="path">
                      {details.activity?.lastPath}
                    </Field>
                    <Field label="Device" name="device">
                      {details.activity?.device}
                    </Field>
                    <Field label="Language" name="locale">
                      {details.activity?.locale}
                    </Field>
                    <Field label="Time zone" name="timezone">
                      {details.activity?.timezone}
                    </Field>
                    <Field label="Approximate location" name="location">
                      {[details.activity?.city, details.activity?.region, details.activity?.country]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </Field>
                  </>
                )}
                <Field label="Location consent" name="consent">
                  <Text
                    fallback={details.profile.locationConsent ? "Granted" : "Not granted"}
                    name={details.profile.locationConsent ? "granted" : "not_granted"}
                  />
                </Field>
                {details.profile.locationConsent ? (
                  <>
                    <Field label="Coordinates" name="coordinates">
                      {details.profile.latitude !== null && details.profile.longitude !== null
                        ? `${details.profile.latitude}, ${details.profile.longitude}`
                        : "—"}
                    </Field>
                    <Field label="Location accuracy (metres)" name="accuracy">
                      {details.profile.accuracy}
                    </Field>
                    <Field label="Location updated" name="location_updated">
                      <DateValue value={details.profile.locationUpdatedAt} />
                    </Field>
                  </>
                ) : null}
              </dl>
            ) : accountBusy ? (
              <Busy />
            ) : null}
          </section>
          <section className="space-y-4 p-5 lg:overflow-y-auto">
            <h3 className="font-semibold">
              <Text fallback="Support history" name="support" />
              {support ? ` (${support.total})` : ""}
            </h3>
            <p className="text-muted-foreground text-xs">
              <Text
                fallback="Contact requests matched by email. This does not verify who submitted them."
                name="support_note"
              />
            </p>
            {supportBusy ? <Busy /> : null}
            {supportError ? (
              <div role="alert">
                <Text
                  fallback="Support history could not be loaded. Retry to confirm the latest requests."
                  name="support_error"
                />
                <Retry busy={supportBusy} onRetry={() => void loadSupport(offset.current)} />
              </div>
            ) : null}
            {support?.total === 0 && !supportError ? (
              <p className="text-muted-foreground text-sm">
                <Text
                  fallback="No support requests found for this email address."
                  name="support_empty"
                />
              </p>
            ) : null}
            {support ? (
              <>
                <ol className="space-y-3">
                  {support.items.map((item) => (
                    <li className="rounded-lg border p-3 text-sm" key={item.id}>
                      <Link
                        className="cursor-pointer font-medium text-primary underline-offset-2 hover:underline"
                        data-nav
                        href={supportConversationUrl(item.id)}
                      >
                        <span>{item.subject}</span>
                      </Link>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border px-2 py-0.5 text-xs">
                          <EditableTranslation
                            defaultText={statusLabels[item.status][1]}
                            description="Support request status."
                            translationKey={statusLabels[item.status][0]}
                          />
                        </span>
                        {!item.isViewed ? (
                          <span className="text-destructive text-xs">
                            <Text fallback="Unread" name="unread" />
                          </span>
                        ) : null}
                      </div>
                      <dl className="mt-3 space-y-2">
                        <Field label="Received" name="received">
                          <DateValue value={item.createdAt} />
                        </Field>
                        <Field label="Last updated" name="support_updated">
                          <DateValue value={item.updatedAt} />
                        </Field>
                        {item.lastInboundAt ? (
                          <Field label="Last customer reply" name="inbound">
                            <DateValue value={item.lastInboundAt} />
                          </Field>
                        ) : null}
                      </dl>
                    </li>
                  ))}
                </ol>
                <div className="flex gap-2">
                  <Button
                    className="cursor-pointer"
                    disabled={supportBusy || support.offset === 0}
                    onClick={() => void loadSupport(Math.max(0, support.offset - supportPageSize))}
                    size="sm"
                    variant="outline"
                  >
                    <Text fallback="Previous" name="previous" />
                  </Button>
                  <Button
                    className="cursor-pointer"
                    disabled={supportBusy || support.offset + supportPageSize >= support.total}
                    onClick={() => void loadSupport(support.offset + supportPageSize)}
                    size="sm"
                    variant="outline"
                  >
                    <Text fallback="Next" name="next" />
                  </Button>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
