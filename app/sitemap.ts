import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://khasigpt.com";

const marketingRoutes = [
  "/",
  "/about",
  "/privacy-policy",
  "/terms-of-service",
];

const accountRoutes = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

const appRoutes = [
  "/chat",
  "/chat/recharge",
  "/chat/subscriptions",
  "/chat/profile",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const buildEntries = (paths: string[]): MetadataRoute.Sitemap => {
    return paths.map((path) => ({
      url: `${baseUrl}${path}`,
      lastModified,
      changeFrequency: "weekly",
      priority: path === "/" ? 1 : 0.6,
    }));
  };

  return [
    ...buildEntries(marketingRoutes),
    ...buildEntries(accountRoutes),
    ...buildEntries(appRoutes),
  ];
}
