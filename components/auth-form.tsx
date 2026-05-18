"use client";

import { Mail } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useTranslation } from "@/components/language-provider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type AuthFormProps = {
  action: NonNullable<
    string | ((formData: FormData) => void | Promise<void>) | undefined
  >;
  children: React.ReactNode;
  defaultEmail?: string;
  lead?: React.ReactNode;
  credentialsVisible?: boolean;
  onShowCredentials?: () => void;
  emailButtonLabel?: string;
  credentialsHref?: string;
};

export function AuthForm({
  action,
  children,
  defaultEmail = "",
  lead,
  credentialsVisible = true,
  onShowCredentials,
  emailButtonLabel,
  credentialsHref,
}: AuthFormProps) {
  const { translate } = useTranslation();
  const resolvedEmailButtonLabel =
    emailButtonLabel ??
    translate("login.continue_with_email", "Continue with Email");

  return (
    <Form action={action} className="flex flex-col gap-4 px-4 sm:px-16">
      {lead}
      {credentialsVisible ? (
        <>
          <div className="flex flex-col gap-2">
            <Label
              className="font-normal text-zinc-600 dark:text-zinc-400"
              htmlFor="email"
            >
              {translate("auth.email_label", "Email Address")}
            </Label>

            <Input
              autoComplete="email"
              autoFocus
              className="bg-muted text-md md:text-sm"
              defaultValue={defaultEmail}
              id="email"
              name="email"
              placeholder={translate(
                "auth.email_placeholder",
                "Your Email Address"
              )}
              required
              type="email"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label
              className="font-normal text-zinc-600 dark:text-zinc-400"
              htmlFor="password"
            >
              {translate("auth.password_label", "Password")}
            </Label>

            <Input
              className="bg-muted text-md md:text-sm"
              id="password"
              name="password"
              required
              type="password"
            />
          </div>

          {children}
        </>
      ) : credentialsHref || onShowCredentials ? (
        credentialsHref ? (
          <Button
            asChild
            className="w-full"
            onClick={onShowCredentials}
            variant="outline"
          >
            <Link href={credentialsHref}>
              <Mail className="mr-2 h-4 w-4" />
              {resolvedEmailButtonLabel}
            </Link>
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={onShowCredentials}
            type="button"
            variant="outline"
          >
            <Mail className="mr-2 h-4 w-4" />
            {resolvedEmailButtonLabel}
          </Button>
        )
      ) : null}
    </Form>
  );
}
