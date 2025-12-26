import { redirect } from "next/navigation";

export default function PublicLandingPage() {
  redirect("/login?callbackUrl=/");
}
