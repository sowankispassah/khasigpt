import { headers } from "next/headers";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://khasigpt.com";
const LIGHT_THEME_COLOR = "#fdfdfd";
const DARK_THEME_COLOR = "#050505";

export default function manifest(): MetadataRoute.Manifest {
  const preferredScheme =
    headers().get("sec-ch-prefers-color-scheme")?.toLowerCase() ?? "";
  const isDarkPreferred = preferredScheme.includes("dark");
  const activeThemeColor = isDarkPreferred ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;

  return {
    name: "KhasiGPT – Khasi Language AI Assistance",
    short_name: "KhasiGPT",
    description:
      "Chat with KhasiGPT to write, translate, and explore ideas in Khasi with cultural context and precise language support.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: activeThemeColor,
    theme_color: activeThemeColor,
    lang: "en",
    categories: ["productivity", "education", "communication"],
    icons: [
      {
        src: "/favicon.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/maskable-icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/images/khasigptlogo.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/maskable-icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
