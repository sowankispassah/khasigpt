import {
  CalendarClock,
  Info,
  Layers,
  type LucideIcon,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AccountMeter,
  AccountNotice,
  AccountSection,
} from "@/components/account/account-ui";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { cn } from "@/lib/utils";

export type RechargeBalance = {
  creditsRemaining: number;
  creditsTotal: number;
  expiresAt: Date | null;
};

const creditFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
// Server-rendered only; a fixed zone keeps the date stable for Indian users
// regardless of the server's own time zone.
const expiryFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

function daysUntil(date: Date, now: number) {
  return Math.max(0, Math.ceil((date.getTime() - now) / 86_400_000));
}

/**
 * Compact balance summary shown above the plans so users see what they
 * already have before buying more.
 */
export function RechargeBalanceCard({
  balance,
  now = Date.now(),
}: {
  /** null when the balance could not be loaded. */
  balance: RechargeBalance | null;
  now?: number;
}) {
  const hasCredits = Boolean(
    balance && (balance.creditsTotal > 0 || balance.expiresAt)
  );
  const percentLeft =
    balance && balance.creditsTotal > 0
      ? (balance.creditsRemaining / balance.creditsTotal) * 100
      : 0;
  const daysLeft =
    balance?.expiresAt ? daysUntil(balance.expiresAt, now) : null;

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
            <Wallet aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-medium text-muted-foreground text-sm">
              <EditableTranslation
                defaultText="Current balance"
                translationKey="recharge.current_balance.title"
              />
            </h2>
            {!balance ? (
              <p className="mt-1 text-amber-700 text-sm dark:text-amber-400">
                <EditableTranslation
                  defaultText="Current balance could not be loaded right now."
                  translationKey="recharge.current_balance.unavailable"
                />
              </p>
            ) : hasCredits ? (
              <>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-2xl tabular-nums tracking-tight sm:text-3xl">
                    {creditFormatter.format(balance.creditsRemaining)}
                  </span>
                  <span className="text-muted-foreground text-sm tabular-nums">
                    <EditableTranslation
                      defaultText="of {total} credits left"
                      description="Shown after the remaining credit balance on the recharge page."
                      translationKey="recharge.current_balance.of_total"
                      values={{ total: creditFormatter.format(balance.creditsTotal) }}
                    />
                  </span>
                </p>
                <AccountMeter
                  className="mt-3 max-w-sm"
                  label={`${Math.round(percentLeft)}%`}
                  tone={percentLeft < 10 ? "warning" : "default"}
                  value={percentLeft}
                />
              </>
            ) : (
              <p className="mt-1 text-sm">
                <EditableTranslation
                  defaultText="You have no credits right now. Choose a plan below to get started."
                  description="Recharge page balance card when the user has no active credits."
                  translationKey="recharge.current_balance.empty"
                />
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          {balance?.expiresAt ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:justify-end">
              <CalendarClock
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="whitespace-nowrap text-muted-foreground">
                <EditableTranslation
                  defaultText="Credits valid until"
                  translationKey="recharge.current_balance.valid_until"
                />
              </span>
              <span className="whitespace-nowrap font-medium">
                {expiryFormatter.format(balance.expiresAt)}
              </span>
              {daysLeft !== null ? (
                <span
                  className={cn(
                    "whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-xs",
                    daysLeft <= 7
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <EditableTranslation
                    defaultText="{days} days left"
                    description="Days until the user's credits expire, shown on the recharge page."
                    translationKey="recharge.current_balance.days_left"
                    values={{ days: daysLeft }}
                  />
                </span>
              ) : null}
            </div>
          ) : null}
          <Link
            className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 self-start rounded-xl border px-4 font-medium text-sm transition hover:bg-muted sm:self-end"
            data-nav
            href="/subscriptions"
          >
            <EditableTranslation
              defaultText="View usage and history"
              description="Recharge page link to the subscriptions dashboard."
              translationKey="recharge.current_balance.view_usage"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}

function InfoItem({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: LucideIcon;
  title: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0">
        <h3 className="font-medium text-sm">{title}</h3>
        <p className="mt-0.5 text-muted-foreground text-sm">{children}</p>
      </div>
    </div>
  );
}

/** Plain-language notes on how recharges behave; each matches the billing code. */
export function RechargeHowItWorks() {
  return (
    <AccountSection
      description={
        <EditableTranslation
          defaultText="What happens when you buy credits."
          description="Short description under the How recharges work heading on the recharge page."
          translationKey="recharge.info.description"
        />
      }
      icon={Info}
      title={
        <EditableTranslation
          defaultText="How recharges work"
          description="Heading of the explanatory section on the recharge page."
          translationKey="recharge.info.title"
        />
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <InfoItem
          icon={Layers}
          title={
            <EditableTranslation
              defaultText="Credits add up"
              description="Recharge page note title: new credits are added to the existing balance."
              translationKey="recharge.info.stack.title"
            />
          }
        >
          <EditableTranslation
            defaultText="Each recharge adds its credits to your current balance, so nothing you already have is lost."
            description="Recharge page note explaining that credits from a new recharge are added to the existing balance."
            translationKey="recharge.info.stack.body"
          />
        </InfoItem>
        <InfoItem
          icon={CalendarClock}
          title={
            <EditableTranslation
              defaultText="Validity never shortens"
              description="Recharge page note title about credit validity."
              translationKey="recharge.info.validity.title"
            />
          }
        >
          <EditableTranslation
            defaultText="Your credits stay valid until the later of your current expiry date and the new plan's validity period."
            description="Recharge page note explaining how a recharge sets the credit expiry date."
            translationKey="recharge.info.validity.body"
          />
        </InfoItem>
        <InfoItem
          icon={RefreshCw}
          title={
            <EditableTranslation
              defaultText="One-time payment"
              description="Recharge page note title: recharges do not renew automatically."
              translationKey="recharge.info.one_time.title"
            />
          }
        >
          <EditableTranslation
            defaultText="You pay once for each recharge. Nothing renews or charges you automatically."
            description="Recharge page note explaining that recharges are one-time payments without auto-renewal."
            translationKey="recharge.info.one_time.body"
          />
        </InfoItem>
        <InfoItem
          icon={ShieldCheck}
          title={
            <EditableTranslation
              defaultText="Secure checkout"
              description="Recharge page note title about the payment provider."
              translationKey="recharge.info.secure.title"
            />
          }
        >
          <EditableTranslation
            defaultText="Payments are completed in Razorpay's secure checkout."
            description="Recharge page note naming the payment provider."
            translationKey="recharge.info.secure.body"
          />
        </InfoItem>
        <InfoItem
          icon={Receipt}
          title={
            <EditableTranslation
              defaultText="Receipts"
              description="Recharge page note title about payment receipts."
              translationKey="recharge.info.receipts.title"
            />
          }
        >
          <EditableTranslation
            defaultText="Download a receipt for any payment from your recharge history on the Subscriptions page."
            description="Recharge page note explaining where to download payment receipts."
            translationKey="recharge.info.receipts.body"
          />
        </InfoItem>
      </div>
    </AccountSection>
  );
}

export function RechargePartialNotice() {
  return (
    <AccountNotice
      title={
        <EditableTranslation
          defaultText="Some recharge details could not be confirmed."
          translationKey="recharge.warning.partial_title"
        />
      }
    >
      <EditableTranslation
        defaultText="Plans are available, but your current balance could not be loaded right now."
        translationKey="recharge.warning.partial_body"
      />
    </AccountNotice>
  );
}

export function RechargeUnavailable() {
  return (
    <section className="flex flex-col items-center rounded-2xl border bg-card px-6 py-12 text-center shadow-xs">
      <span className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
        <Wallet aria-hidden="true" className="size-6" />
      </span>
      <p className="mt-4 max-w-md text-muted-foreground text-sm">
        <EditableTranslation
          defaultText="Recharge plans could not be loaded right now. Please retry shortly."
          translationKey="recharge.error.pricing_unavailable"
        />
      </p>
      <a
        className="mt-5 inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 font-medium text-primary-foreground text-sm transition hover:bg-primary/90"
        href="/recharge"
      >
        <RefreshCw aria-hidden="true" className="size-4" />
        <EditableTranslation
          defaultText="Retry"
          translationKey="recharge.error.retry"
        />
      </a>
    </section>
  );
}
