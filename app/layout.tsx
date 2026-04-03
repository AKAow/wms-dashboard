import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WindTree WMS",
  description: "기상 측정 데이터 통합 관리 플랫폼",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#0a0e17] text-slate-50 antialiased">
        {children}
      </body>
    </html>
  );
}
