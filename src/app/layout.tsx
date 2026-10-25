import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { Flash } from "@/components/flash";
import { env } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MMA OS — Train. Fight. Improve.", template: "%s · MMA OS" },
  description:
    "The all-in-one platform for MMA gyms: memberships, billing, classes, attendance, fighters, coaches and fight camps.",
  applicationName: "MMA OS",
  // Demo deployments are never indexed by search engines.
  robots: env.demoSeed ? { index: false, follow: false } : { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0B0D10",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const theme = jar.get("mma_theme")?.value ?? "dark";
  const light = theme === "light";
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${light ? "light" : ""}`} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-[var(--accent-ink)]"
        >
          Skip to content
        </a>
        {children}
        <Suspense fallback={null}>
          <Flash />
        </Suspense>
        {env.demoSeed ? (
          <div className="pointer-events-none fixed bottom-3 left-3 z-[60] rounded-full border px-3 py-1 text-[0.68rem] font-medium shadow-lg"
               style={{ background: "var(--surface)", borderColor: "var(--line-strong)", color: "var(--muted)" }}>
            Demo environment · synthetic data · payments are tests
          </div>
        ) : null}
      </body>
    </html>
  );
}
