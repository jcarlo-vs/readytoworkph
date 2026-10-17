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

export const metadata: Metadata = {
  title: "RemotePinas - Hire skilled Filipino remote workers",
  description: "Find and hire top Filipino remote talent, or find your next remote job.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-slate-50 font-sans text-slate-900">
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
