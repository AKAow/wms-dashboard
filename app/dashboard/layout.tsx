import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0a0e17]">
      <Sidebar />
      <main className="ml-56 min-h-screen p-6">{children}</main>
    </div>
  );
}
