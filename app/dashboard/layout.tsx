import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0e17]">
      <Sidebar />
      {/* 데스크탑: ml-56 / 모바일: pt-16 (햄버거 버튼 공간) */}
      <main className="md:ml-56 pt-16 md:pt-0 min-h-screen p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
