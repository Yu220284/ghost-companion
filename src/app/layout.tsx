import type { Metadata, Viewport } from "next";
import { AppProviders } from "@/components/providers";
import "./globals.css";

const title = "Ghost Companion — ふわっと、そばに。";
const description =
  "100bas dialogue companion for the cute floating ghost. Chat and watch-over only — robot control is a separate app.";

export const metadata: Metadata = {
  title: {
    default: title,
    template: "%s — Ghost Companion",
  },
  description,
  keywords: ["100bas", "ghost", "companion", "dialogue", "お化け"],
  authors: [{ name: "100bas" }],
  icons: {
    icon: "/ghost/normal.png",
    shortcut: "/ghost/normal.png",
    apple: "/ghost/normal.png",
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    alternateLocale: ["en_US"],
    title,
    description,
    siteName: "Ghost Companion",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050812",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
