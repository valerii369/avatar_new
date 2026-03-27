import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "AVATAR — Эволюция Сознания",
  description: "Telegram Mini App: цифровой паспорт личности по 12 сферам",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#060818",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="stars-bg">{children}</body>
    </html>
  );
}
