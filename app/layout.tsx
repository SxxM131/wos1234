import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "관직 예약",
  description: "WOS 관직 예약 자동화 시스템",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <main className="mx-auto min-h-screen max-w-lg px-4 pb-8 pt-4">
          {children}
        </main>
      </body>
    </html>
  );
}
