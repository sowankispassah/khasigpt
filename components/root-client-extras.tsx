"use client";

import dynamic from "next/dynamic";

const PwaInstallBanner = dynamic(
  () =>
    import("@/components/pwa-install-banner").then(
      (module) => module.PwaInstallBanner
    ),
  {
    ssr: false,
  }
);

export function RootClientExtras() {
  return <PwaInstallBanner />;
}
