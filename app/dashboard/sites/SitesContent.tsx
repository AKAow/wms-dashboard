"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, MapPin, Pencil, Activity, ArrowLeft } from "lucide-react";
import type { Site } from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import SiteDetail from "./SiteDetail";

export default function SitesContent() {
  const [sites, setSites] = useState<Site[]>([]);
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");

  useEffect(() => {
    async function fetchData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push("/login");
      const { data } = await supabase.from("sites").select("*").order("name");
      if (data) setSites(data);
    }
    fetchData();
  }, [router, supabase]);

  const selectedSite = sites.find((s) => s.id === selectedId);

  if (selectedSite) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.push("/dashboard/sites")}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> 사이트 목록으로
        </button>
        <SiteDetail site={selectedSite} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">사이트 관리</h1>
          <p className="text-sm text-slate-400 mt-1">기상 측정 사이트 목록 및 설정</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors">
          <Plus className="w-4 h-4" /> 사이트 추가
        </button>
      </div>

      <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800/60">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">사이트명</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">사이트 번호</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">위치</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">고도</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">상태</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {sites.map((site) => (
              <tr key={site.id} className="hover:bg-slate-800/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <button onClick={() => router.push(`/dashboard/sites?id=${site.id}`)}
                      className="text-sm font-medium text-white hover:text-blue-400 transition-colors">
                      {site.name}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3"><span className="text-xs font-mono bg-slate-800 text-slate-300 px-2 py-1 rounded">{site.site_number}</span></td>
                <td className="px-4 py-3 text-sm text-slate-400">{site.location_name ?? "-"}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{site.elevation ? `${site.elevation}m` : "-"}</td>
                <td className="px-4 py-3">
                  <span className={`flex items-center gap-1.5 text-xs font-medium w-fit ${site.is_active ? "text-green-400" : "text-slate-500"}`}>
                    <Activity className="w-3 h-3" />{site.is_active ? "활성" : "비활성"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors inline-flex">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {sites.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">등록된 사이트가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
