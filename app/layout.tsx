import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { GlobalProgressBar } from "@/components/global-progress-bar";
import { LanguageProvider } from "@/components/language-provider";
import { PageUserMenu } from "@/components/page-user-menu";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import { ThemeProvider } from "@/components/theme-provider";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { auth } from "./(auth)/auth";

import "./globals.css";
import { SessionProvider } from "next-auth/react";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://khasigpt.com";
const siteName = "KhasiGPT";
const siteTitle = "KhasiGPT – Khasi Language AI Assistance";
const siteDescription =
  "Chat with KhasiGPT, the AI assistant built for Khasi speakers. Write, translate, and explore ideas in Khasi with cultural context and accurate language support.";
const siteLogo = new URL("/images/khasigptlogo.png", siteUrl).toString();
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: siteName,
      url: siteUrl,
      logo: siteLogo,
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: siteTitle,
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

const PRELOAD_PROGRESS_STYLE = `
  #__preload-progress {
    position: fixed;
    left: 0;
    right: 0;
    top: 0;
    height: 4px;
    pointer-events: none;
    z-index: 9999;
    background: rgba(0,0,0,0.05);
  }
  #__preload-progress-bar {
    height: 100%;
    width: 100%;
    transform-origin: left;
    transform: scaleX(0);
    background: var(--primary, #22c55e);
    transition: transform 150ms ease-out;
  }
`;

const PRELOAD_PROGRESS_SCRIPT = `(function() {
  if (window.__preloadProgressInit) return;
  window.__preloadProgressInit = true;
  var container = document.createElement('div');
  container.id = '__preload-progress';
  var bar = document.createElement('div');
  bar.id = '__preload-progress-bar';
  container.appendChild(bar);
  document.documentElement.appendChild(container);

  var start = performance.now();
  var progress = 0;
  var raf;
  var done = false;

  function step() {
    if (done) return;
    var elapsed = performance.now() - start;
    var target = Math.min(95, 8 + elapsed * 0.045); // reach ~90% in ~2s
    var delta = Math.max(0.4, (target - progress) * 0.2);
    progress = Math.min(target, progress + delta);
    bar.style.transform = 'scaleX(' + (progress / 100) + ')';
    raf = requestAnimationFrame(step);
  }

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    bar.style.transform = 'scaleX(1)';
    setTimeout(function() {
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }, 220);
  }

  window.__hidePreloadProgress = finish;
  step();
  window.addEventListener('load', finish);
})();`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  category: "technology",
  title: {
    default: siteTitle,
    template: `%s – ${siteName}`,
  },
  description: siteDescription,
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
      name: siteName,
      url: siteUrl,
    },
  ],
  creator: siteName,
  publisher: siteName,
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName,
    title: siteTitle,
    description: siteDescription,
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
    title: siteTitle,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
  appleWebApp: {
    capable: true,
    title: siteTitle,
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

const LIGHT_THEME_COLOR = "hsl(0 0% 100%)";
const DARK_THEME_COLOR = "hsl(240deg 10% 3.92%)";
const THEME_COLOR_SCRIPT = `(function() {
  var html = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  function updateThemeColor() {
    var isDark = html.classList.contains('dark');
    meta.setAttribute('content', isDark ? '${DARK_THEME_COLOR}' : '${LIGHT_THEME_COLOR}');
  }
  var observer = new MutationObserver(updateThemeColor);
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  updateThemeColor();
})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const { languages, activeLanguage, dictionary } =
    await getTranslationBundle(preferredLanguage);
  const session = await auth();

  return (
    <html
      className={`${geist.variable} ${geistMono.variable}`}
      lang={activeLanguage.code}
      suppressHydrationWarning
    >
      <head>
        <style
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
          <LanguageProvider
            activeLanguage={activeLanguage}
            dictionary={dictionary}
            languages={languages}
          >
            <SessionProvider session={session ?? undefined}>
              <GlobalProgressBar />
              <PageUserMenu forumEnabled />
              {children}
            </SessionProvider>
            <Toaster position="top-center" />
            <SpeedInsights />
            <PwaInstallBanner />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
