import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5faff_0%,#eaf4ff_100%)]">
      <Sidebar />
      {/* 데스크탑: ml-56 + 상단 여백 / 모바일: pt-16 (햄버거 버튼 공간) */}
      <main className="md:ml-56 pt-16 md:pt-6 min-h-screen p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
