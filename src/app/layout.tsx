import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import { JsonLd } from "@/components/seo/JsonLd";
import { organizationSchema, websiteSchema } from "@/lib/seo/structuredData";
import { getSiteUrl } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // metadataBase is what makes every relative canonical and Open Graph URL
  // in the app resolve to an absolute one. Without it Next warns and emits
  // relative og:url values, which crawlers ignore.
  metadataBase: new URL(getSiteUrl()),
  title: {
    // Pages set their own title; anything that doesn't gets the default.
    default: "ApnaHealth — find verified doctors, clinics and hospitals near you",
    template: "%s — ApnaHealth",
  },
  description:
    "Find verified doctors, clinics and hospitals near you. Book a digital OPD token and track the live queue from home.",
  applicationName: "ApnaHealth",
  openGraph: {
    type: "website",
    siteName: "ApnaHealth",
    locale: "en_IN",
  },
  twitter: { card: "summary" },
  // Explicitly permissive at the root so the per-page noindex on private
  // pages reads as a deliberate exception rather than the only rule.
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Site-level identity and the search box a crawler can offer.
            Page-level Physician/MedicalClinic markup is emitted by the
            pages themselves. */}
        <JsonLd data={[organizationSchema(), websiteSchema()]} />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
