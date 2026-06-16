"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LayoutDashboard, MapPin, Users, Database, Settings, LogOut, Menu, X, Wind } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/dashboard/sites", label: "사이트 관리", icon: MapPin },
  { href: "/dashboard/users", label: "사용자 관리", icon: Users },
  { href: "/dashboard/data", label: "데이터 관리", icon: Database },
  { href: "/dashboard/turbines", label: "터빈 파워커브", icon: Wind },
  { href: "/dashboard/settings", label: "설정", icon: Settings },
];

function NavContent({
  isActive,
  onNavigate,
  onLogout,
}: {
  isActive: (href: string) => boolean;
  onNavigate: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      {/* 로고 */}
      <div className="p-5 border-b border-[#d6e8ff]">
        <div className="flex items-center gap-2.5">
          <img src="/brand/logo-mark.png" alt="WindTree" className="w-8 h-8 rounded-lg" />
          <div>
            <img src="/brand/logo-horizontal.png" alt="WindTree" className="h-5 w-auto object-contain" />
            <p className="text-[10px] text-blue-500 font-semibold tracking-widest mt-0.5">WMS DASHBOARD</p>
          </div>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
              isActive(href)
                ? "bg-blue-600/20 text-blue-400 font-medium"
                : "text-slate-600 hover:text-slate-900 hover:bg-blue-50"
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* 로그아웃 */}
      <div className="p-3 border-t border-[#d6e8ff]">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-all"
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </button>
      </div>
    </>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login/";
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/dashboard/";
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* 모바일 햄버거 버튼 */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-white/80 backdrop-blur-xl border border-[#d6e8ff] text-slate-600 hover:text-slate-900 md:hidden"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* 모바일 오버레이 */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* 모바일 드로어 */}
      <aside
        className={`fixed left-0 top-0 h-full w-56 bg-white/80 backdrop-blur-xl border-r border-[#d6e8ff] flex flex-col z-50 transition-transform duration-200
          md:translate-x-0
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        {/* 모바일 닫기 버튼 */}
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 p-1 text-slate-500 hover:text-slate-900 md:hidden"
        >
          <X className="w-4 h-4" />
        </button>
        <NavContent
          isActive={isActive}
          onNavigate={() => setOpen(false)}
          onLogout={handleLogout}
        />
      </aside>
    </>
  );
}
