"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, MapPin, Pencil, Activity, ArrowLeft, Loader2 } from "lucide-react";
import type { Site } from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import SiteDetail from "./SiteDetail";
import Modal from "@/components/Modal";

type SiteForm = {
  name: string;
  site_number: string;
  location_name: string;
  latitude: string;
  longitude: string;
  elevation: string;
  ipack_email: string;
  is_active: boolean;
};

const emptyForm: SiteForm = { name: "", site_number: "", location_name: "", latitude: "", longitude: "", elevation: "", ipack_email: "", is_active: true };

export default function SitesContent() {
  const [sites, setSites] = useState<Site[]>([]);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editSite, setEditSite] = useState<Site | null>(null);
  const [form, setForm] = useState<SiteForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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

  const openAdd = () => { setForm(emptyForm); setEditSite(null); setError(""); setModal("add"); };
  const openEdit = (site: Site) => {
    setForm({
      name: site.name, site_number: site.site_number,
      location_name: site.location_name ?? "", latitude: site.latitude?.toString() ?? "",
      longitude: site.longitude?.toString() ?? "", elevation: site.elevation?.toString() ?? "",
      ipack_email: site.ipack_email ?? "", is_active: site.is_active,
    });
    setEditSite(site); setError(""); setModal("edit");
  };

  const handleSave = async () => {
    if (!form.name || !form.site_number) { setError("사이트명과 사이트 번호는 필수입니다."); return; }
    setSaving(true); setError("");
    const payload = {
      name: form.name, site_number: form.site_number,
      location_name: form.location_name || null,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      elevation: form.elevation ? parseInt(form.elevation) : null,
      ipack_email: form.ipack_email || null,
      is_active: form.is_active,
    };
    let err;
    if (modal === "add") {
      const res = await supabase.from("sites").insert(payload);
      err = res.error;
    } else if (editSite) {
      const res = await supabase.from("sites").update(payload).eq("id", editSite.id);
      err = res.error;
    }
    setSaving(false);
    if (err) { setError(err.message); return; }
    setModal(null);
    const { data } = await supabase.from("sites").select("*").order("name");
    if (data) setSites(data);
  };

  const selectedSite = sites.find((s) => s.id === selectedId);

  const inp = "w-full rounded-xl border border-slate-700/80 bg-[#020617]/50 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none transition-all";

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
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors">
          <Plus className="w-4 h-4" /> 사이트 추가
        </button>
      </div>

      <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800/60">
              {["사이트명","사이트 번호","위치","고도","상태",""].map((h,i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {sites.map((site) => (
              <tr key={site.id} className="hover:bg-slate-800/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <button onClick={() => router.push(`/dashboard/sites?id=${site.id}`)}
                      className="text-sm font-medium text-white hover:text-blue-400 transition-colors text-left">
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
                  <button onClick={() => openEdit(site)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors inline-flex">
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

      {modal && (
        <Modal title={modal === "add" ? "사이트 추가" : "사이트 편집"} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">사이트명 *</label>
                <input className={inp} value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="Wando Daesin" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">사이트 번호 *</label>
                <input className={inp} value={form.site_number} onChange={e => setForm({...form,site_number:e.target.value})} placeholder="017546" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">위치명</label>
              <input className={inp} value={form.location_name} onChange={e => setForm({...form,location_name:e.target.value})} placeholder="Junnam Wando" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">위도</label>
                <input className={inp} value={form.latitude} onChange={e => setForm({...form,latitude:e.target.value})} placeholder="34.3389" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">경도</label>
                <input className={inp} value={form.longitude} onChange={e => setForm({...form,longitude:e.target.value})} placeholder="126.676" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">고도(m)</label>
                <input className={inp} value={form.elevation} onChange={e => setForm({...form,elevation:e.target.value})} placeholder="325" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">iPack 이메일</label>
              <input className={inp} value={form.ipack_email} onChange={e => setForm({...form,ipack_email:e.target.value})} placeholder="447498801685@packet-mail.net" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">활성 상태</label>
              <button onClick={() => setForm({...form,is_active:!form.is_active})}
                className={`relative w-10 h-5 rounded-full transition-colors ${form.is_active ? "bg-blue-600" : "bg-slate-700"}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.is_active ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
            {error && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm text-slate-400 hover:text-white transition-colors">취소</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" />저장 중...</> : "저장"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
