
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Plus, MapPin, Pencil, Activity } from "lucide-react";
import type { Site } from "@/lib/types";

export default async function SitesPage() {
  const supabase = await createClient();
  const { data: sites } = await supabase.from("sites").select("*").order("name");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">사이트 관리</h1>
          <p className="text-sm text-slate-400 mt-1">기상 측정 사이트 목록 및 설정</p>
        </div>
        <Link
          href="/dashboard/sites/new"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
          사이트 추가
        </Link>
      </div>

      <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800/60">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">사이트명</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">사이트 번호</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">위치</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">고도</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">iPack 이메일</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">상태</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {(sites ?? []).map((site: Site) => (
              <tr key={site.id} className="hover:bg-slate-800/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <Link href={`/dashboard/sites/${site.id}`} className="text-sm font-medium text-white hover:text-blue-400 transition-colors">
                      {site.name}
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2 py-1 rounded">{site.site_number}</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">{site.location_name ?? "-"}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{site.elevation ? `${site.elevation}m` : "-"}</td>
                <td className="px-4 py-3 text-xs text-slate-500 font-mono">{site.ipack_email ?? "-"}</td>
                <td className="px-4 py-3">
                  <span className={`flex items-center gap-1.5 text-xs font-medium w-fit ${site.is_active ? "text-green-400" : "text-slate-500"}`}>
                    <Activity className="w-3 h-3" />
                    {site.is_active ? "활성" : "비활성"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/dashboard/sites/${site.id}/edit`} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors inline-flex">
                    <Pencil className="w-3.5 h-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
            {(sites ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                  등록된 사이트가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
