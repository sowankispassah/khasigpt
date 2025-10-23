import { redirect } from "next/navigation";

import { auth } from "../auth";
import { CompleteProfileForm } from "./complete-profile-form";

export default async function CompleteProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.dateOfBirth) {
    redirect("/");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold">Almost there!</h1>
          <p className="text-muted-foreground text-sm">
            Please confirm your date of birth. We can only offer access to
            people who are at least 13 years old.
          </p>
        </div>
        <CompleteProfileForm />
      </div>
    </div>
  );
}
