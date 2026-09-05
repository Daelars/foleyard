import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { SiteJsonLd } from "@/components/site-json-ld";
import { SITE_URL, SITE_KEYWORDS } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Foleyard - Find the right sound before the idea disappears",
    template: "%s - Foleyard",
  },
  description:
    "A local-first browser for messy SFX folders, music cues, and massive audio libraries.",
  keywords: SITE_KEYWORDS,
  authors: [{ name: "Foleyard" }],
  creator: "Foleyard",
  publisher: "Foleyard",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "Foleyard",
    title: "Foleyard - Find the right sound before the idea disappears",
    description:
      "A local-first browser for messy SFX folders, music cues, and massive audio libraries.",
    images: [{ url: "/app_preview.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Foleyard - Find the right sound before the idea disappears",
    description:
      "A local-first browser for messy SFX folders, music cues, and massive audio libraries.",
    images: ["/app_preview.png"],
  },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.ico" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0c0a09",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full antialiased dark">
        <body className="min-h-full flex flex-col">
          <SiteJsonLd />
          <ConvexClientProvider>{children}</ConvexClientProvider>
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
