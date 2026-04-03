"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Shield, Eye, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";

type Access = {
  id: string;
  sites: { name: string; site_number: string } | null;
  role: string;
  granted_at: string;
};

export default function UsersPage() {
  const [accesses, setAccesses] = useState<Access[]>([]);
  const [modal, setModal] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function fetchData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push("/login");
      const { data } = await supabase.from("user_site_access").select("*, sites(name, site_number)");
      if (data) setAccesses(data as Access[]);
    }
    fetchData();
  }, [router, supabase]);

  const handleInvite = async () => {
    if (!email) return;
    setSaving(true); setError(""); setSuccess("");
    // Supabase Admin API로 초대 (실제 구현 시 서버 함수 필요)
    // 현재는 이메일 표시만
    setTimeout(() => {
      setSaving(false);
      setSuccess(`${email} 로 초대 이메일이 발송됩니다. (서버 함수 연결 후 활성화)`);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">사용자 관리</h1>
          <p className="text-sm text-slate-400 mt-1">접근 권한 및 사용자 계정 관리</p>
        </div>
        <button onClick={() => { setEmail(""); setError(""); setSuccess(""); setModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors">
          <Plus className="w-4 h-4" /> 사용자 초대
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
          <div className="flex items-center gap-2 mb-1"><Shield className="w-4 h-4 text-blue-400" /><span className="text-xs text-slate-400">내부 관리자</span></div>
          <p className="text-2xl font-bold text-white">3</p>
          <p className="text-xs text-slate-500 mt-1">모든 사이트 접근 가능</p>
        </div>
        <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
          <div className="flex items-center gap-2 mb-1"><Eye className="w-4 h-4 text-purple-400" /><span className="text-xs text-slate-400">클라이언트</span></div>
          <p className="text-2xl font-bold text-white">{accesses.filter((a) => a.role === "viewer").length}</p>
          <p className="text-xs text-slate-500 mt-1">지정 사이트만 접근</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] overflow-hidden">
        <div className="p-4 border-b border-slate-800/60"><h2 className="text-sm font-semibold text-white">권한 목록</h2></div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800/40">
              {["사이트","역할","부여일"].map((h,i) => <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {accesses.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">권한 데이터가 없습니다</td></tr>
            ) : (
              accesses.map((a) => (
                <tr key={a.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3 text-sm text-white">{a.sites ? `${a.sites.name} (${a.sites.site_number})` : "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${a.role === "admin" ? "bg-blue-400/10 text-blue-400" : "bg-purple-400/10 text-purple-400"}`}>
                      {a.role === "admin" ? "관리자" : "뷰어"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{new Date(a.granted_at).toLocaleDateString("ko")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title="사용자 초대" onClose={() => setModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">이메일 주소</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-xl border border-slate-700/80 bg-[#020617]/50 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            {error && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}
            {success && <p className="text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2">{success}</p>}
            <div className="flex gap-3">
              <button onClick={() => setModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm text-slate-400 hover:text-white transition-colors">취소</button>
              <button onClick={handleInvite} disabled={saving || !email}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white disabled:opacity-60 flex items-center justify-center gap-2 transition-colors">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" />처리 중...</> : "초대 발송"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
