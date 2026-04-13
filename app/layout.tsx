import type { Metadata, Viewport } from "next";
import { AppChrome } from "@/components/AppChrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "סופרים קלוריות",
  description: "יומן קלוריות חכם עם יעדים, משקל ודוח אסטרטגי",
};

export const viewport: Viewport = {
  themeColor: "#fadadd",
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
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
