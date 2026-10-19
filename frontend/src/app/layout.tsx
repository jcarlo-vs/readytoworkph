import type { Metadata } from "next";
import { Geist, Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import { AuthProvider } from "@/lib/auth";
import { Nav, Footer } from "@/components/ui";
import { TopLoader } from "@/components/TopLoader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["500", "800"],
});

const DESCRIPTION = "Remote jobs for Filipino professionals, and a direct way for employers to hire them. Work from home full-time, part-time or per project, paid in dollars. Free to join.";

export const metadata: Metadata = {
  metadataBase: new URL("https://readytowork.ph"),
  title: { default: "ReadyToWork.ph: Remote jobs for Filipino professionals", template: "%s | ReadyToWork.ph" },
  description: DESCRIPTION,
  applicationName: "ReadyToWork.ph",
  keywords: ["remote jobs Philippines", "work from home jobs Philippines", "online jobs Philippines", "hire Filipino virtual assistant", "Filipino remote workers", "freelance jobs Philippines"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website", siteName: "ReadyToWork.ph", locale: "en_PH", url: "/",
    title: "ReadyToWork.ph: Remote jobs for Filipino professionals", description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ReadyToWork.ph: remote jobs for Filipino professionals" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${jakarta.variable} h-full antialiased`}>
      {/* wrap-anywhere: a word too long for its box (a pasted link, "asdasd..." with no spaces) breaks instead of running off the card */}
      <body className="flex min-h-full flex-col bg-[#f3f7f4] font-sans text-slate-900 wrap-anywhere">
        <Suspense>
          <TopLoader />
        </Suspense>
        <AuthProvider>
          {/* Nav reads the current path; the placeholder keeps the page from jumping while it loads. */}
          <Suspense fallback={<div className="h-[65px] border-b border-slate-200 bg-white" />}>
            <Nav />
          </Suspense>
          <main className="flex-1">
            <Suspense>{children}</Suspense>
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
