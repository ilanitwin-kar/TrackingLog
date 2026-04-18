import type { Metadata, Viewport } from "next";
import { AppChrome } from "@/components/AppChrome";
import { ThemeRoot } from "@/components/ThemeRoot";
import "./globals.css";

export const metadata: Metadata = {
  title: "יומן המעקב של אינטליגנציה קלורית",
  description: "יומן קלוריות חכם עם יעדים, משקל ודוח אסטרטגי",
};

export const viewport: Viewport = {
  themeColor: "#9b1b30",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-dvh antialiased">
        <ThemeRoot />
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
