"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Shield, Eye, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";

type Access = {
  id: string;
  user_id: string;
  sites: { id: string; name: string; site_number: string } | null;
  role: "admin" | "viewer";
  granted_at: string;
};

type SiteOption = { id: string; name: string; site_number: string };

export default function UsersPage() {
  const [accesses, setAccesses] = useState<Access[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  const [modal, setModal] = useState(false);
  const [email, setEmail] = useState("");
  const [targetRole, setTargetRole] = useState<"viewer" | "admin">("viewer");
  const [targetSiteId, setTargetSiteId] = useState("");

  const [saving, setSaving] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const supabase = createClient();
  const router = useRouter();

  const reload = async () => {
    const [{ data: accessData }, { data: siteData }] = await Promise.all([
      supabase
        .from("user_site_access")
        .select("id,user_id,role,granted_at,sites(id,name,site_number)")
        .order("granted_at", { ascending: false }),
      supabase.from("sites").select("id,name,site_number").order("name"),
    ]);

    if (accessData) setAccesses(accessData as Access[]);
    if (siteData) {
      const opts = siteData as SiteOption[];
      setSites(opts);
      if (!targetSiteId && opts[0]) setTargetSiteId(opts[0].id);
    }
  };

  useEffect(() => {
    async function init() {
      setChecking(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      const { data: mine } = await supabase
        .from("user_site_access")
        .select("role")
        .eq("user_id", session.user.id)
        .limit(1);

      const admin = (mine ?? []).some((x) => x.role === "admin");
      setIsAdmin(admin);

      if (!admin) {
        setError("관리자 권한이 필요합니다.");
        setChecking(false);
        return;
      }

      await reload();
      setChecking(false);
    }

    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, supabase]);

  const handleInvite = async () => {
    if (!email || !targetSiteId) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const { error: invokeError } = await supabase.functions.invoke("invite-user-site", {
      body: {
        email,
        role: targetRole,
        siteId: targetSiteId,
      },
    });

    if (invokeError) {
      setSaving(false);
      setError("초대 함수가 아직 연결되지 않았습니다. (functions: invite-user-site)");
      return;
    }

    await reload();
    setSaving(false);
    setSuccess(`${email} 초대 요청이 처리되었습니다.`);
  };

  const adminCount = useMemo(
    () => new Set(accesses.filter((a) => a.role === "admin").map((a) => a.user_id)).size,
    [accesses],
  );
  const viewerCount = useMemo(
    () => new Set(accesses.filter((a) => a.role === "viewer").map((a) => a.user_id)).size,
    [accesses],
  );

  const handleChangeRole = async (access: Access, nextRole: "admin" | "viewer") => {
    setChangingId(access.id);
    setError("");
    setSuccess("");

    const { error: invokeError } = await supabase.functions.invoke("manage-user-site-access", {
      body: {
        userId: access.user_id,
        siteId: access.sites?.id,
        action: "set-role",
        role: nextRole,
      },
    });

    if (invokeError) {
      setChangingId(null);
      setError(`권한 변경 실패: ${invokeError.message}`);
      return;
    }

    await reload();
    setChangingId(null);
    setSuccess("권한이 변경되었습니다.");
  };

  const handleRemoveAccess = async (access: Access) => {
    if (!confirm("이 사용자의 해당 사이트 권한을 제거할까요?")) return;

    setChangingId(access.id);
    setError("");
    setSuccess("");

    const { error: invokeError } = await supabase.functions.invoke("manage-user-site-access", {
      body: {
        userId: access.user_id,
        siteId: access.sites?.id,
        action: "remove",
      },
    });

    if (invokeError) {
      setChangingId(null);
      setError(`권한 제거 실패: ${invokeError.message}`);
      return;
    }

    await reload();
    setChangingId(null);
    setSuccess("권한이 제거되었습니다.");
  };

  if (checking) {
    return <div className="text-sm text-slate-500 py-8">권한 확인 중...</div>;
  }

  if (!isAdmin) {
    return <div className="text-sm text-rose-600 py-8">{error || "관리자 권한이 필요합니다."}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">사용자 관리</h1>
          <p className="text-sm text-slate-500 mt-1">접근 권한 및 사용자 계정 관리</p>
        </div>
        <button
          onClick={() => {
            setEmail("");
            setError("");
            setSuccess("");
            setModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors"
        >
          <Plus className="w-4 h-4" /> 사용자 초대
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-slate-500">내부 관리자</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{adminCount}</p>
          <p className="text-xs text-slate-500 mt-1">모든 사이트 접근 가능</p>
        </div>
        <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-slate-500">클라이언트</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{viewerCount}</p>
          <p className="text-xs text-slate-500 mt-1">지정 사이트만 접근</p>
        </div>
      </div>

      <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl overflow-hidden">
        <div className="p-4 border-b border-[#d6e8ff]">
          <h2 className="text-sm font-semibold text-slate-900">권한 목록</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#d6e8ff]/70">
              {["사용자ID", "사이트", "역할", "부여일", "관리"].map((h, i) => (
                <th
                  key={i}
                  className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d6e8ff]/70">
            {accesses.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                  권한 데이터가 없습니다
                </td>
              </tr>
            ) : (
              accesses.map((a) => (
                <tr key={a.id} className="hover:bg-blue-50/60 transition-colors">
                  <td className="px-4 py-3 text-xs text-slate-600 font-mono">{a.user_id}</td>
                  <td className="px-4 py-3 text-sm text-slate-900">
                    {a.sites ? `${a.sites.name} (${a.sites.site_number})` : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        a.role === "admin" ? "bg-blue-400/10 text-blue-500" : "bg-purple-400/10 text-purple-500"
                      }`}
                    >
                      {a.role === "admin" ? "관리자" : "뷰어"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {new Date(a.granted_at).toLocaleDateString("ko")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleChangeRole(a, a.role === "admin" ? "viewer" : "admin")}
                        disabled={changingId === a.id || !a.sites?.id}
                        className="px-2 py-1 text-xs rounded-md border border-[#c8def8] text-slate-700 hover:bg-blue-50 disabled:opacity-50"
                      >
                        {a.role === "admin" ? "뷰어로 변경" : "관리자로 변경"}
                      </button>
                      <button
                        onClick={() => handleRemoveAccess(a)}
                        disabled={changingId === a.id || !a.sites?.id}
                        className="px-2 py-1 text-xs rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        권한 제거
                      </button>
                    </div>
                  </td>
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
              <label className="block text-xs text-slate-500 mb-1.5">이메일 주소</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-xl border border-[#c8def8] bg-white/70 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">권한</label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as "viewer" | "admin")}
                  className="w-full rounded-xl border border-[#c8def8] bg-white/70 px-3 py-2.5 text-sm text-slate-900"
                >
                  <option value="viewer">뷰어</option>
                  <option value="admin">관리자</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">사이트</label>
                <select
                  value={targetSiteId}
                  onChange={(e) => setTargetSiteId(e.target.value)}
                  className="w-full rounded-xl border border-[#c8def8] bg-white/70 px-3 py-2.5 text-sm text-slate-900"
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.site_number})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            {success && (
              <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#c8def8] text-sm text-slate-500 hover:text-slate-900 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleInvite}
                disabled={saving || !email || !targetSiteId}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />처리 중...
                  </>
                ) : (
                  "초대 발송"
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
