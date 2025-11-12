import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://khasigpt.com";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KhasiGPT – Khasi Language AI Assistance",
    short_name: "KhasiGPT",
    description:
      "Chat with KhasiGPT to write, translate, and explore ideas in Khasi with cultural context and precise language support.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#080808",
    lang: "en",
    categories: ["productivity", "education", "communication"],
    icons: [
      {
        src: "/favicon.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/images/khasigptlogo.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
