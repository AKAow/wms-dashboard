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
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[linear-gradient(180deg,#f5faff_0%,#eaf4ff_100%)] text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
