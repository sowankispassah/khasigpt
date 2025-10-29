import Form from "next/form";
import { Mail } from "lucide-react";

import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";

type AuthFormProps = {
  action: NonNullable<
    string | ((formData: FormData) => void | Promise<void>) | undefined
  >;
  children: React.ReactNode;
  defaultEmail?: string;
  lead?: React.ReactNode;
  credentialsVisible?: boolean;
  onShowCredentials?: () => void;
};

export function AuthForm({
  action,
  children,
  defaultEmail = "",
  lead,
  credentialsVisible = true,
  onShowCredentials,
}: AuthFormProps) {
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
              Email Address
            </Label>

            <Input
              autoComplete="email"
              autoFocus
              className="bg-muted text-md md:text-sm"
              defaultValue={defaultEmail}
              id="email"
              name="email"
              placeholder="user@acme.com"
              required
              type="email"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label
              className="font-normal text-zinc-600 dark:text-zinc-400"
              htmlFor="password"
            >
              Password
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
      ) : onShowCredentials ? (
        <Button
          className="w-full"
          type="button"
          variant="outline"
          onClick={onShowCredentials}
        >
          <Mail className="mr-2 h-4 w-4" />
          Continue with Email
        </Button>
      ) : null}
    </Form>
  );
}
