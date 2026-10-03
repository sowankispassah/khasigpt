import type { MetadataRoute } from "next";
import { getActiveLanguages } from "@/lib/i18n/languages";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://khasigpt.com";

const marketingRoutes = ["/", "/about", "/privacy-policy", "/terms-of-service"];
const localizedMarketingRoutes = ["/about", "/privacy-policy", "/terms-of-service"];

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  const buildEntries = (paths: string[]): MetadataRoute.Sitemap => {
    return paths.map((path) => ({
      url: `${baseUrl}${path}`,
      lastModified,
      changeFrequency: "weekly",
      priority: path === "/" ? 1 : 0.6,
    }));
  };

  let localeEntries: MetadataRoute.Sitemap = [];

  try {
    const languages = await getActiveLanguages();
    const localizedPaths = languages.flatMap((language) => [
      `/${language.code}`,
      ...localizedMarketingRoutes.map((route) => `/${language.code}${route}`),
    ]);
    localeEntries = buildEntries(localizedPaths);
  } catch {
    // Ignore locale expansion failures in sitemap generation.
  }

  return [
    ...buildEntries(marketingRoutes),
    ...localeEntries,
    ...buildEntries(accountRoutes),
    ...buildEntries(appRoutes),
  ];
}
