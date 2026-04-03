"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Wind, LayoutDashboard, MapPin, Users, Database, Settings, LogOut, Menu, X } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/dashboard/sites", label: "사이트 관리", icon: MapPin },
  { href: "/dashboard/users", label: "사용자 관리", icon: Users },
  { href: "/dashboard/data", label: "데이터 관리", icon: Database },
  { href: "/dashboard/settings", label: "설정", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
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

  const NavContent = () => (
    <>
      {/* 로고 */}
      <div className="p-5 border-b border-slate-800/60">
        <div className="flex items-center gap-2.5">
          <div className="flex w-8 h-8 border rounded-lg items-center justify-center border-slate-700/50 bg-slate-900/80">
            <Wind className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">WindTree</p>
            <p className="text-[10px] text-blue-400 font-semibold tracking-widest">WMS</p>
          </div>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
              isActive(href)
                ? "bg-blue-600/20 text-blue-400 font-medium"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* 로그아웃 */}
      <div className="p-3 border-t border-slate-800/60">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-all"
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* 모바일 햄버거 버튼 */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-[#020617] border border-slate-800 text-slate-400 hover:text-white md:hidden"
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
        className={`fixed left-0 top-0 h-full w-56 bg-[#020617] border-r border-slate-800/60 flex flex-col z-50 transition-transform duration-200
          md:translate-x-0
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        {/* 모바일 닫기 버튼 */}
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 p-1 text-slate-500 hover:text-white md:hidden"
        >
          <X className="w-4 h-4" />
        </button>
        <NavContent />
      </aside>
    </>
  );
}
