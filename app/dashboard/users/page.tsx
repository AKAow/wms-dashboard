import { createClient } from "@/lib/supabase/server";
import { Plus, Shield, Eye } from "lucide-react";

export default async function UsersPage() {
  const supabase = await createClient();

  const { data: accesses } = await supabase
    .from("user_site_access")
    .select("*, sites(name, site_number)");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">사용자 관리</h1>
          <p className="text-sm text-slate-400 mt-1">접근 권한 및 사용자 계정 관리</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors">
          <Plus className="w-4 h-4" />
          사용자 초대
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-slate-400">내부 관리자</span>
          </div>
          <p className="text-2xl font-bold text-white">3</p>
          <p className="text-xs text-slate-500 mt-1">모든 사이트 접근 가능</p>
        </div>
        <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-slate-400">클라이언트</span>
          </div>
          <p className="text-2xl font-bold text-white">{(accesses ?? []).filter((a: { role: string }) => a.role === "viewer").length}</p>
          <p className="text-xs text-slate-500 mt-1">지정 사이트만 접근</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] overflow-hidden">
        <div className="p-4 border-b border-slate-800/60">
          <h2 className="text-sm font-semibold text-white">권한 목록</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800/40">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">사이트</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">역할</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">부여일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {(accesses ?? []).length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">
                  권한 데이터가 없습니다
                </td>
              </tr>
            ) : (
              (accesses ?? []).map((a: { id: string; sites: { name: string; site_number: string } | null; role: string; granted_at: string }) => (
                <tr key={a.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3 text-sm text-white">
                    {a.sites ? `${a.sites.name} (${a.sites.site_number})` : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      a.role === "admin" ? "bg-blue-400/10 text-blue-400" : "bg-purple-400/10 text-purple-400"
                    }`}>
                      {a.role === "admin" ? "관리자" : "뷰어"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {new Date(a.granted_at).toLocaleDateString("ko")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
