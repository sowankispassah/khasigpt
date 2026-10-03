import type { Metadata } from "next";
import Link from "next/link";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { verifyAccountDeletionRequestToken } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify Account Deletion Request",
  description: "Verify ownership for an account deletion request.",
};

type VerifySearchParams = {
  token?: string | string[];
};

function resolveToken(value: string | string[] | undefined) {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

export default async function VerifyDeleteAccountPage({
  searchParams,
}: {
  searchParams?: Promise<VerifySearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const token = resolveToken(resolvedSearchParams?.token);
  const result = token
    ? await verifyAccountDeletionRequestToken(token)
    : ({ status: "invalid" } as const);
  const referenceId =
    result.status === "verified" || result.status === "already_verified"
      ? result.request.referenceId
      : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 py-10">
      <div className="rounded-lg border bg-card p-6 text-center shadow-sm">
        {result.status === "verified" || result.status === "already_verified" ? (
          <>
            <h1 className="font-semibold text-2xl">
              <EditableTranslation
                defaultText="Your account deletion request has been received."
                translationKey="delete_account.success.title"
              />
            </h1>
            <p className="mt-4 text-muted-foreground text-sm">
              <EditableTranslation
                defaultText="Reference ID:"
                translationKey="delete_account.success.reference_prefix"
              />{" "}
              <span className="font-mono font-semibold text-foreground">
                {referenceId}
              </span>
            </p>
            <p className="mt-4 text-muted-foreground text-sm leading-6">
              <EditableTranslation
                defaultText="We will review your request and process it according to our data retention policy."
                translationKey="delete_account.success.body"
              />
            </p>
          </>
        ) : result.status === "expired" ? (
          <>
            <h1 className="font-semibold text-2xl">
              <EditableTranslation
                defaultText="Verification link expired"
                translationKey="delete_account.verify.expired.title"
              />
            </h1>
            <p className="mt-4 text-muted-foreground text-sm leading-6">
              <EditableTranslation
                defaultText="This verification link has expired. Submit the deletion request again to receive a new verification email."
                translationKey="delete_account.verify.expired.body"
              />
            </p>
          </>
        ) : (
          <>
            <h1 className="font-semibold text-2xl">
              <EditableTranslation
                defaultText="Invalid verification link"
                translationKey="delete_account.verify.invalid.title"
              />
            </h1>
            <p className="mt-4 text-muted-foreground text-sm leading-6">
              <EditableTranslation
                defaultText="This deletion verification link is invalid or has already been used."
                translationKey="delete_account.verify.invalid.body"
              />
            </p>
          </>
        )}

        <div className="mt-6 flex justify-center">
          <Link
            className="cursor-pointer rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
            data-nav
            href="/help/delete-account"
          >
            <EditableTranslation
              defaultText="Back to deletion page"
              translationKey="delete_account.verify.back"
            />
          </Link>
        </div>
      </div>
    </div>
  );
}
