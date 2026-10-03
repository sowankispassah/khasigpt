export const DEFAULT_SITE_URL = "https://khasigpt.com";
export const SITE_NAME = "KhasiGPT";
export const SITE_TITLE = "KhasiGPT – Khasi Language AI Assistance";
export const SITE_DESCRIPTION =
  "Chat with KhasiGPT, the AI assistant built for Khasi speakers. Write, translate, and explore ideas in Khasi with cultural context and accurate language support.";

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_SITE_URL;
}

export function buildStructuredData(siteUrl: string) {
  const siteLogo = new URL("/images/khasigptlogo.png", siteUrl).toString();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: SITE_NAME,
        url: siteUrl,
        logo: siteLogo,
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: SITE_TITLE,
        publisher: {
          "@id": `${siteUrl}/#organization`,
        },
        inLanguage: "en",
      },
      {
        "@type": "SiteNavigationElement",
        name: "Chat",
        url: `${siteUrl}/chat`,
      },
      {
        "@type": "SiteNavigationElement",
        name: "About",
        url: `${siteUrl}/about`,
      },
      {
        "@type": "SiteNavigationElement",
        name: "Pricing",
        url: `${siteUrl}/chat/recharge`,
      },
      {
        "@type": "SiteNavigationElement",
        name: "Privacy Policy",
        url: `${siteUrl}/privacy-policy`,
      },
      {
        "@type": "SiteNavigationElement",
        name: "Terms of Service",
        url: `${siteUrl}/terms-of-service`,
      },
    ],
  } as const;
}
