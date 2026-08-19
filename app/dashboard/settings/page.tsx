"use client";

import { useEffect, useState, useCallback } from "react";
import { Settings, Key, Mail, CheckCircle, Loader2, CalendarDays, Plus, Trash2, AlertCircle, Play } from "lucide-react";

const WORKER_BASE = "https://wms-rld-worker.aka-74b.workers.dev";
const DAYS = ["매일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"] as const;
const TIMES = ["06:00", "10:00", "14:00", "18:00"] as const;

type GmailAccount = {
  slot: string;
  userKey: string;
  tokenKey: string;
  email: string | null;
  set: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function useSaveState(): [SaveState, string, (fn: () => Promise<void>) => void] {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const run = useCallback((fn: () => Promise<void>) => {
    setState("saving");
    setError("");
    fn()
      .then(() => {
        setState("saved");
        setTimeout(() => setState("idle"), 2500);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "저장 실패");
        setState("error");
      });
  }, []);
  return [state, error, run];
}

export default function SettingsPage() {
  // NRG
  const [nrgSecret, setNrgSecret] = useState("");
  const [nrgState, nrgError, runNrg] = useSaveState();

  // 스케줄
  const [syncDay, setSyncDay] = useState<(typeof DAYS)[number]>("수요일");
  const [syncTime, setSyncTime] = useState<(typeof TIMES)[number]>("10:00");
  const [loadingCron, setLoadingCron] = useState(true);
  const [cronState, cronError, runCron] = useSaveState();

  // 수동 동기화
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("");

  // Gmail 기본 계정
  const [defaultEmail, setDefaultEmail] = useState<string | null>(null);
  const [defaultToken, setDefaultToken] = useState("");
  const [defaultState, defaultError, runDefault] = useSaveState();

  // Gmail 추가 계정
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [addingSlot, setAddingSlot] = useState<string | null>(null);
  const [addEmail, setAddEmail] = useState("");
  const [addToken, setAddToken] = useState("");
  const [gmailSaving, setGmailSaving] = useState(false);
  const [gmailError, setGmailError] = useState("");

  const loadAccounts = useCallback(async () => {
    try {
      const r = await fetch(`${WORKER_BASE}/worker-secrets`, { cache: "no-store" });
      const d = (await r.json()) as { ok?: boolean; accounts?: GmailAccount[] };
      if (d.ok && d.accounts) {
        setAccounts(d.accounts);
        const def = d.accounts.find((a) => a.slot === "default");
        if (def) setDefaultEmail(def.email);
      }
    } catch {
      // 오류 무시
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${WORKER_BASE}/cron-config`, { cache: "no-store" });
        const d = (await r.json()) as { ok?: boolean; dayKst?: string; hourKst?: number; minuteKst?: number };
        if (alive && r.ok && d?.ok && d.dayKst && DAYS.includes(d.dayKst as (typeof DAYS)[number])) {
          setSyncDay(d.dayKst as (typeof DAYS)[number]);
          if (typeof d.hourKst === "number" && typeof d.minuteKst === "number") {
            const hh = String(d.hourKst).padStart(2, "0");
            const mm = String(d.minuteKst).padStart(2, "0");
            const t = `${hh}:${mm}`;
            if (TIMES.includes(t as (typeof TIMES)[number])) setSyncTime(t as (typeof TIMES)[number]);
          }
        }
      } catch {
        // noop
      } finally {
        if (alive) setLoadingCron(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  const handleNrgSave = () => {
    if (!nrgSecret.trim()) return;
    runNrg(async () => {
      const r = await fetch(`${WORKER_BASE}/worker-secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-nrg", nrgClientSecret: nrgSecret.trim() }),
      });
      const d = await r.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error || "저장 실패");
      setNrgSecret("");
    });
  };

  const handleCronSave = () => {
    runCron(async () => {
      const r = await fetch(`${WORKER_BASE}/cron-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayKst: syncDay, hourKst: Number(syncTime.split(":")[0]), minuteKst: 0 }),
      });
      const d = await r.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error || "cron-update-failed");
    });
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncResult("");
    try {
      const r = await fetch(`${WORKER_BASE}/sync-rld`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json().catch(() => ({})) as { ok?: boolean; processed?: number; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error || "sync-failed");
      setSyncResult(`완료: ${d.processed ?? 0}개 처리`);
    } catch (e) {
      setSyncResult(`오류: ${e instanceof Error ? e.message : "실패"}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleDefaultTokenSave = () => {
    if (!defaultToken.trim()) return;
    runDefault(async () => {
      const r = await fetch(`${WORKER_BASE}/worker-secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-token", slot: "default", refreshToken: defaultToken.trim() }),
      });
      const d = await r.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error || "저장 실패");
      setDefaultToken("");
    });
  };

  const handleGmailAdd = async (slot: string) => {
    if (!addEmail.trim() || !addToken.trim()) {
      setGmailError("이메일과 Refresh Token을 모두 입력하세요");
      return;
    }
    setGmailSaving(true);
    setGmailError("");
    try {
      const r = await fetch(`${WORKER_BASE}/worker-secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", slot, email: addEmail.trim(), refreshToken: addToken.trim() }),
      });
      const d = await r.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error || "저장 실패");
      setAddingSlot(null);
      setAddEmail("");
      setAddToken("");
      await loadAccounts();
    } catch (e) {
      setGmailError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setGmailSaving(false);
    }
  };

  const handleGmailDelete = async (slot: string, email: string | null) => {
    if (!window.confirm(`계정 ${email ?? slot}을(를) 삭제하시겠습니까?`)) return;
    setGmailSaving(true);
    setGmailError("");
    try {
      const r = await fetch(`${WORKER_BASE}/worker-secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", slot }),
      });
      const d = await r.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error || "삭제 실패");
      await loadAccounts();
    } catch (e) {
      setGmailError(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setGmailSaving(false);
    }
  };

  const extraAccounts = accounts.filter((a) => a.slot !== "default");
  const availableSlots = extraAccounts.filter((a) => !a.set);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">설정</h1>
        <p className="text-sm text-slate-500 mt-1">시스템 연동 및 API 키 관리</p>
      </div>

      <div className="space-y-4">

        {/* NRG Cloud API */}
        <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-400/10"><Key className="w-5 h-5 text-blue-400" /></div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">NRG Cloud API</h3>
              <p className="text-xs text-slate-500">RLD 파일 변환 서비스</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Client Secret</label>
              <input
                type="password"
                value={nrgSecret}
                onChange={(e) => setNrgSecret(e.target.value)}
                placeholder="새 시크릿 입력 시에만 입력"
                className="w-full rounded-xl border border-[#c8def8] bg-white/70 px-4 py-2.5 text-sm font-mono text-slate-700 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-xs text-green-400">연결됨</span>
              </div>
              <button
                onClick={handleNrgSave}
                disabled={nrgState === "saving" || !nrgSecret.trim()}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors disabled:opacity-60 flex items-center gap-1.5"
              >
                {nrgState === "saving" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />저장 중</> : nrgState === "saved" ? <><CheckCircle className="w-3.5 h-3.5" />저장됨</> : <><Key className="w-3.5 h-3.5" />Secret 저장</>}
              </button>
            </div>
            {nrgState === "error" && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{nrgError}</p>}
          </div>
        </div>

        {/* 자동 동기화 스케줄 */}
        <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-orange-400/10"><CalendarDays className="w-5 h-5 text-orange-400" /></div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">자동 동기화 스케줄</h3>
              <p className="text-xs text-slate-500">Gmail 필터는 사이트별 설정에서 관리</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-500">동기화 주기</span>
              <div className="flex items-center gap-2">
                <select
                  value={syncDay}
                  onChange={(e) => setSyncDay(e.target.value as (typeof DAYS)[number])}
                  disabled={loadingCron}
                  className="rounded-lg border border-[#c8def8] bg-white/70 px-3 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none disabled:opacity-60"
                >
                  {DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
                </select>
                <select
                  value={syncTime}
                  onChange={(e) => setSyncTime(e.target.value as (typeof TIMES)[number])}
                  disabled={loadingCron}
                  className="rounded-lg border border-[#c8def8] bg-white/70 px-3 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none disabled:opacity-60"
                >
                  {TIMES.map((time) => <option key={time} value={time}>{time} KST</option>)}
                </select>
              </div>
            </div>

            <p className="text-xs text-slate-500 pt-1 border-t border-[#d6e8ff]">
              현재 설정: {syncDay === "매일" ? `매일 ${syncTime}` : `주 1회 ${syncDay} ${syncTime}`} KST
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCronSave}
                disabled={cronState === "saving" || loadingCron}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors disabled:opacity-60 flex items-center gap-1.5"
              >
                {cronState === "saving" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />저장 중</> : cronState === "saved" ? <><CheckCircle className="w-3.5 h-3.5" />저장됨</> : <><Settings className="w-3.5 h-3.5" />스케줄 저장</>}
              </button>
              <button
                onClick={handleManualSync}
                disabled={syncing}
                className="px-4 py-2 rounded-lg border border-[#c8def8] bg-white/70 hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors disabled:opacity-60 flex items-center gap-1.5"
              >
                {syncing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />동기화 중</> : <><Play className="w-3.5 h-3.5" />지금 동기화</>}
              </button>
            </div>
            {cronState === "error" && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{cronError}</p>}
            {syncResult && <p className="text-xs text-slate-500">{syncResult}</p>}
          </div>
        </div>

        {/* Gmail 기본 계정 */}
        <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-red-400/10"><Mail className="w-5 h-5 text-red-400" /></div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Gmail 기본 계정</h3>
              <p className="text-xs text-slate-500">토큰 만료 시 Refresh Token 업데이트</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Gmail 계정</label>
              <input
                type="text"
                value={loadingAccounts ? "불러오는 중..." : (defaultEmail ?? "(미설정)")}
                readOnly
                className="w-full rounded-xl border border-[#c8def8] bg-slate-50/70 px-4 py-2.5 text-sm text-slate-500 cursor-default"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">새 Refresh Token</label>
              <input
                type="password"
                value={defaultToken}
                onChange={(e) => setDefaultToken(e.target.value)}
                placeholder="1//0g... 형식의 Refresh Token"
                className="w-full rounded-xl border border-[#c8def8] bg-white/70 px-4 py-2.5 text-sm font-mono text-slate-700 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end">
              <button
                onClick={handleDefaultTokenSave}
                disabled={defaultState === "saving" || !defaultToken.trim()}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors disabled:opacity-60 flex items-center gap-1.5"
              >
                {defaultState === "saving" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />저장 중</> : defaultState === "saved" ? <><CheckCircle className="w-3.5 h-3.5" />저장됨</> : "토큰 업데이트"}
              </button>
            </div>
            {defaultState === "error" && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{defaultError}</p>}
          </div>
        </div>

        {/* Gmail 추가 계정 관리 */}
        <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-400/10"><Mail className="w-5 h-5 text-green-500" /></div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Gmail 추가 계정</h3>
                <p className="text-xs text-slate-500">사이트별 수신 계정 (슬롯 2·3)</p>
              </div>
            </div>
            {availableSlots.length > 0 && !addingSlot && (
              <button
                onClick={() => { setAddingSlot(availableSlots[0].slot); setGmailError(""); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> 계정 추가
              </button>
            )}
          </div>

          {loadingAccounts ? (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...
            </div>
          ) : (
            <div className="space-y-2">
              {extraAccounts.map((acc) => (
                <div key={acc.slot} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-[#d6e8ff] bg-white/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${acc.set ? "bg-green-400" : "bg-slate-300"}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-slate-700 truncate">{acc.email ?? "(미설정)"}</p>
                      <p className="text-[10px] text-slate-500">슬롯 {acc.slot}</p>
                    </div>
                  </div>
                  {acc.set && (
                    <button
                      onClick={() => handleGmailDelete(acc.slot, acc.email)}
                      disabled={gmailSaving}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {addingSlot && (
                <div className="mt-3 space-y-2 p-3 rounded-lg border border-blue-200 bg-blue-50/50">
                  <p className="text-xs font-semibold text-slate-700">슬롯 {addingSlot} 계정 추가</p>
                  <input
                    type="email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    className="w-full rounded-lg border border-[#c8def8] bg-white/70 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                  <input
                    type="password"
                    value={addToken}
                    onChange={(e) => setAddToken(e.target.value)}
                    placeholder="Refresh Token (1//0...)"
                    className="w-full rounded-lg border border-[#c8def8] bg-white/70 px-3 py-2 text-sm font-mono text-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                  {gmailError && (
                    <p className="flex items-center gap-1.5 text-xs text-red-500">
                      <AlertCircle className="w-3.5 h-3.5" />{gmailError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setAddingSlot(null); setAddEmail(""); setAddToken(""); setGmailError(""); }}
                      className="flex-1 py-2 rounded-lg border border-[#c8def8] text-xs text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => handleGmailAdd(addingSlot)}
                      disabled={gmailSaving}
                      className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {gmailSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />저장 중</> : "저장"}
                    </button>
                  </div>
                </div>
              )}

              {gmailError && !addingSlot && (
                <p className="flex items-center gap-1.5 text-xs text-red-500 pt-1">
                  <AlertCircle className="w-3.5 h-3.5" />{gmailError}
                </p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
