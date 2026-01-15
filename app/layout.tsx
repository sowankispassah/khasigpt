import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { GlobalProgressBar } from "@/components/global-progress-bar";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import { ThemeProvider } from "@/components/theme-provider";
import {
  PRELOAD_PROGRESS_SCRIPT,
  PRELOAD_PROGRESS_STYLE,
  THEME_COLOR_SCRIPT,
} from "@/lib/security/inline-scripts";
import {
  buildStructuredData,
  getSiteUrl,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
} from "@/lib/seo/site";

import "./globals.css";

const siteUrl = getSiteUrl();
const structuredData = buildStructuredData(siteUrl);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: SITE_NAME,
  category: "technology",
  title: {
    default: SITE_TITLE,
    template: `%s – ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "KhasiGPT",
    "Khasi AI",
    "Khasi chatbot",
    "Khasi language",
    "AI assistant",
    "Khasi translation",
  ],
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.webmanifest",
  authors: [
    {
      name: SITE_NAME,
      url: siteUrl,
    },
  ],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "KhasiGPT – Khasi language AI assistant",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
  appleWebApp: {
    capable: true,
    title: SITE_TITLE,
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      {
        url: "/favicon.ico",
        type: "image/x-icon",
      },
    ],
    shortcut: "/favicon.ico",
    apple: "/favicon.png",
  },
};

export const viewport = {
  maximumScale: 1,
};

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${geist.variable} ${geistMono.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <style
          /* biome-ignore lint/security/noDangerouslySetInnerHtml: Needed for early paint progress */
          dangerouslySetInnerHTML={{
            __html: PRELOAD_PROGRESS_STYLE,
          }}
        />
        <script
          /* biome-ignore lint/security/noDangerouslySetInnerHtml: Needed for early paint progress */
          dangerouslySetInnerHTML={{
            __html: PRELOAD_PROGRESS_SCRIPT,
          }}
        />
        <script
          /* biome-ignore lint/security/noDangerouslySetInnerHtml: Needed to keep theme-color meta in sync */
          dangerouslySetInnerHTML={{
            __html: THEME_COLOR_SCRIPT,
          }}
        />
        <script
          /* biome-ignore lint/security/noDangerouslySetInnerHtml: Inject structured data for SEO */
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
          type="application/ld+json"
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
        >
          <GlobalProgressBar />
          {children}
          <Toaster position="top-center" />
          <SpeedInsights />
          <PwaInstallBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
