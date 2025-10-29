"use client";

import { useEffect, useState, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { getProviders, signIn } from "next-auth/react";

type GoogleSignInSectionProps = {
  callbackUrl: string;
  mode: "login" | "register";
};

const LABELS: Record<GoogleSignInSectionProps["mode"], string> = {
  login: "Continue with Google",
  register: "Sign up with Google",
};

const GoogleIcon = (props: ComponentProps<"svg">) => (
  <svg
    viewBox="0 0 18 18"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    {...props}
  >
    <path
      fill="#4285F4"
      d="M17.64 9.2045c0-.638-.0573-1.251-.1636-1.836H9v3.472h4.844c-.2093 1.1257-.843 2.0796-1.7969 2.7178v2.258h2.9087c1.7027-1.565 2.6832-3.8744 2.6832-6.6128z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.4676-.8067 5.9565-2.183l-2.9088-2.258c-.8067.54-1.8384.858-3.0476.858-2.3442 0-4.3288-1.584-5.0364-3.7104H.9576v2.3318C2.4384 15.6322 5.4816 18 9 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.9636 10.706c-.18-.54-.2832-1.116-.2832-1.706 0-.59.1032-1.166.2832-1.706V4.9624H.9576C.3474 6.1734 0 7.5474 0 9c0 1.4526.3474 2.8266.9576 4.0376L3.9636 10.706z"
    />
    <path
      fill="#EA4335"
      d="M9 3.5796c1.3212 0 2.5056.4548 3.4428 1.3488l2.5812-2.5812C13.4656.8934 11.4288 0 9 0 5.4816 0 2.4384 2.3678.9576 5.9624l3.006 2.3318C4.6711 5.1636 6.6558 3.5796 9 3.5796z"
    />
  </svg>
);

export function GoogleSignInSection({
  callbackUrl,
  mode,
}: GoogleSignInSectionProps) {
  const [isPending, setIsPending] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const providers = await getProviders();
        if (!isMounted) {
          return;
        }
        setIsAvailable(Boolean(providers?.google));
      } catch (error) {
        console.error("Failed to load auth providers", error);
        if (isMounted) {
          setIsAvailable(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!isAvailable) {
    return null;
  }

  const handleClick = async () => {
    setIsPending(true);
    try {
      await signIn("google", {
        callbackUrl,
      });
    } catch (error) {
      console.error("Failed to start Google sign-in", error);
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Button
        className="w-full"
        disabled={isPending}
        onClick={handleClick}
        type="button"
        variant="outline"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <GoogleIcon className="h-4 w-4" />
        )}
        <span>{LABELS[mode]}</span>
      </Button>
    </div>
  );
}
