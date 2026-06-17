"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Upload, Download, ChevronDown, ChevronUp, Wind } from "lucide-react";
import type { PowerCurvePoint } from "@/lib/simulation-types";
import { STANDARD_TURBINE_SCENARIOS } from "@/lib/simulation-constants";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

interface DbTurbineCurve {
  id: string;
  name: string;
  rated_mw: number;
  iec_class: string | null;
  cut_in: number;
  rated_speed: number;
  cut_out: number;
  hub_height_m: number | null;
  rotor_diameter_m: number | null;
  curve_data: PowerCurvePoint[];
  notes: string | null;
  is_builtin: boolean;
  created_at: string;
}

type CurveForm = Omit<DbTurbineCurve, "id" | "is_builtin" | "created_at">;

const EMPTY_FORM: CurveForm = {
  name: "",
  rated_mw: 4.2,
  iec_class: "II",
  cut_in: 3,
  rated_speed: 12,
  cut_out: 25,
  hub_height_m: 100,
  rotor_diameter_m: 145,
  curve_data: [
    { ws: 3, kw: 0 },
    { ws: 6, kw: 500 },
    { ws: 9, kw: 2000 },
    { ws: 12, kw: 4200 },
    { ws: 25, kw: 0 },
  ],
  notes: "",
};

function PowerCurveChart({ points, cutIn, cutOut, ratedMw }: { points: PowerCurvePoint[]; cutIn?: number; cutOut?: number; ratedMw?: number }) {
  const sorted = [...points].sort((a, b) => a.ws - b.ws);
  const maxKw = ratedMw ? ratedMw * 1000 : Math.max(...sorted.map((p) => p.kw), 1);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={sorted} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2ecfa" />
        <XAxis dataKey="ws" type="number" domain={["dataMin", "dataMax"]} tickCount={8}
          tick={{ fontSize: 11, fill: "#64748b" }} label={{ value: "풍속 (m/s)", position: "insideBottomRight", offset: -4, fontSize: 11, fill: "#94a3b8" }} />
        <YAxis domain={[0, maxKw * 1.05]} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}MW` : `${v}`}
          tick={{ fontSize: 11, fill: "#64748b" }} width={52} />
        <Tooltip formatter={(v: number) => [`${v.toLocaleString()} kW`, "출력"]}
          labelFormatter={(l) => `${l} m/s`}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #d6e8ff" }} />
        {cutIn  && <ReferenceLine x={cutIn}  stroke="#f59e0b" strokeDasharray="4 2" label={{ value: "컷인", fontSize: 10, fill: "#f59e0b" }} />}
        {cutOut && <ReferenceLine x={cutOut} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "컷아웃", fontSize: 10, fill: "#ef4444" }} />}
        <Line type="monotone" dataKey="kw" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function CurveEditor({ points, onChange }: { points: PowerCurvePoint[]; onChange: (pts: PowerCurvePoint[]) => void }) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[80px_90px_32px] gap-1 text-[11px] text-slate-500 px-1">
        <span>풍속 (m/s)</span><span>출력 (kW)</span><span />
      </div>
      <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
        {points.map((p, i) => (
          <div key={i} className="grid grid-cols-[80px_90px_32px] gap-1">
            <input type="number" step="0.5" value={p.ws}
              onChange={(e) => onChange(points.map((x, j) => j === i ? { ...x, ws: parseFloat(e.target.value) || 0 } : x))}
              className="rounded border border-[#d6e8ff] px-2 py-1 text-xs text-slate-900 w-full" />
            <input type="number" step="10" value={p.kw}
              onChange={(e) => onChange(points.map((x, j) => j === i ? { ...x, kw: parseFloat(e.target.value) || 0 } : x))}
              className="rounded border border-[#d6e8ff] px-2 py-1 text-xs text-slate-900 w-full" />
            <button type="button" onClick={() => onChange(points.filter((_, j) => j !== i))}
              className="rounded border border-red-200 text-red-500 hover:bg-red-50 flex items-center justify-center">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...points, { ws: 0, kw: 0 }])}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-1">
        <Plus className="w-3 h-3" /> 행 추가
      </button>
    </div>
  );
}

function FormFields({ form, setForm }: { form: CurveForm; setForm: (f: CurveForm) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[11px] text-slate-500">기종명 *</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="예: Vestas V150-4.5MW"
            className="w-full rounded-lg border border-[#d6e8ff] px-3 py-2 text-sm text-slate-900" />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-slate-500">정격 출력 (MW) *</span>
          <input type="number" step="0.1" value={form.rated_mw}
            onChange={(e) => setForm({ ...form, rated_mw: parseFloat(e.target.value) || 0 })}
            className="w-full rounded-lg border border-[#d6e8ff] px-3 py-2 text-sm text-slate-900" />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-slate-500">IEC 등급</span>
          <select value={form.iec_class ?? ""} onChange={(e) => setForm({ ...form, iec_class: e.target.value })}
            className="w-full rounded-lg border border-[#d6e8ff] px-3 py-2 text-sm text-slate-900">
            <option value="">미지정</option>
            <option value="I">I</option><option value="II">II</option>
            <option value="III">III</option><option value="I/II">I/II</option>
            <option value="S">S (저풍속)</option>
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["cut_in", "rated_speed", "cut_out"] as const).map((f) => (
            <label key={f} className="space-y-1">
              <span className="text-[11px] text-slate-500">{f === "cut_in" ? "컷인" : f === "rated_speed" ? "정격" : "컷아웃"} m/s</span>
              <input type="number" step="0.5" value={form[f]}
                onChange={(e) => setForm({ ...form, [f]: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-lg border border-[#d6e8ff] px-2 py-2 text-sm text-slate-900" />
            </label>
          ))}
        </div>
        <label className="space-y-1">
          <span className="text-[11px] text-slate-500">허브 높이 (m)</span>
          <input type="number" value={form.hub_height_m ?? ""}
            onChange={(e) => setForm({ ...form, hub_height_m: parseInt(e.target.value) || 0 })}
            className="w-full rounded-lg border border-[#d6e8ff] px-3 py-2 text-sm text-slate-900" />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-slate-500">로터 직경 (m)</span>
          <input type="number" value={form.rotor_diameter_m ?? ""}
            onChange={(e) => setForm({ ...form, rotor_diameter_m: parseInt(e.target.value) || 0 })}
            className="w-full rounded-lg border border-[#d6e8ff] px-3 py-2 text-sm text-slate-900" />
        </label>
      </div>
      <label className="space-y-1 block">
        <span className="text-[11px] text-slate-500">메모 (출처·버전·조건 등)</span>
        <input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="w-full rounded-lg border border-[#d6e8ff] px-3 py-2 text-sm text-slate-900" />
      </label>
      <div>
        <div className="text-[11px] text-slate-500 mb-1.5">파워커브 데이터 * (ws 오름차순 자동 정렬)</div>
        <CurveEditor points={form.curve_data} onChange={(pts) => setForm({ ...form, curve_data: pts })} />
      </div>
    </div>
  );
}

export default function TurbinesPage() {
  const supabase = createClient();
  const [curves, setCurves] = useState<DbTurbineCurve[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedBuiltin, setExpandedBuiltin] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CurveForm | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<CurveForm>({ ...EMPTY_FORM });
  const csvRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("turbine_curves").select("*").order("created_at", { ascending: false });
    setCurves((data as DbTurbineCurve[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (form: CurveForm, id?: string) => {
    if (!form.name || form.curve_data.length < 2) return;
    setSaving(true); setError("");
    const payload = { ...form, curve_data: [...form.curve_data].sort((a, b) => a.ws - b.ws) };
    const { error: err } = id
      ? await supabase.from("turbine_curves").update(payload).eq("id", id)
      : await supabase.from("turbine_curves").insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setShowNew(false); setEditId(null); setEditForm(null); setNewForm({ ...EMPTY_FORM });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await supabase.from("turbine_curves").delete().eq("id", id);
    load();
  };

  const handleCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = (ev.target?.result as string).split("\n").map((l) => l.trim()).filter(Boolean);
      const pts: PowerCurvePoint[] = [];
      for (const line of lines) {
        const parts = line.split(/[,\t]/);
        const ws = parseFloat(parts[0]);
        const kw = parseFloat(parts[1]);
        if (Number.isFinite(ws) && Number.isFinite(kw)) pts.push({ ws, kw });
      }
      if (pts.length < 2) { setError("CSV 파싱 실패 — ws,kw 형식 확인 (헤더 없이)"); return; }
      setNewForm((f) => ({ ...f, curve_data: pts }));
      setShowNew(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const exportCsv = (c: DbTurbineCurve) => {
    const csv = ["ws_ms,kw", ...[...c.curve_data].sort((a, b) => a.ws - b.ws).map((p) => `${p.ws},${p.kw}`)].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${c.name.replace(/\s+/g, "_")}_curve.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">터빈 파워커브 관리</h1>
          <p className="text-sm text-slate-500 mt-0.5">커스텀 기종 등록 · CSV 업로드 · 시뮬레이션 탭에서 선택 가능</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <input ref={csvRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsv} />
          <button onClick={() => csvRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-[#d6e8ff] bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Upload className="w-3.5 h-3.5" /> CSV 업로드
          </button>
          <button onClick={() => { setShowNew(true); setNewForm({ ...EMPTY_FORM }); }}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500">
            <Plus className="w-3.5 h-3.5" /> 새 커브 등록
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-xs text-amber-800">
        <b>CSV 형식:</b> 헤더 없이 <code className="bg-amber-100 px-1 rounded">풍속(m/s),출력(kW)</code> 1행씩. 탭 구분자도 지원.
        예: <code className="bg-amber-100 px-1 rounded">3,0</code> / <code className="bg-amber-100 px-1 rounded">12,4200</code> / <code className="bg-amber-100 px-1 rounded">25,0</code>
      </div>

      {showNew && (
        <div className="rounded-xl border border-blue-300 bg-blue-50/40 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">새 터빈 커브 등록</h3>
          <FormFields form={newForm} setForm={setNewForm} />
          <div className="flex gap-2 pt-1">
            <button onClick={() => save(newForm)} disabled={saving || !newForm.name || newForm.curve_data.length < 2}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-blue-500">
              {saving ? "저장 중…" : "저장"}
            </button>
            <button onClick={() => setShowNew(false)}
              className="rounded-lg border border-[#d6e8ff] px-4 py-2 text-xs text-slate-600 hover:bg-slate-50">취소</button>
          </div>
        </div>
      )}

      {/* 내장 기종 */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">내장 기종 (읽기 전용 · 스크리닝용 근사 커브)</h2>
        <div className="space-y-1.5">
          {STANDARD_TURBINE_SCENARIOS.map((s) => (
            <div key={s.key} className="rounded-xl border border-[#d6e8ff] bg-white/70">
              <div className="px-4 py-2.5 flex items-center gap-3 cursor-pointer"
                onClick={() => setExpandedBuiltin(expandedBuiltin === s.key ? null : s.key)}>
                <Wind className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">{s.name}</div>
                  <div className="text-xs text-slate-500">
                    {s.ratedMw}MW · IEC {s.iecClass} · 허브 {s.hubHeightM}m · 로터 {s.rotorDiameterM}m · 컷인 {s.cutIn} / 컷아웃 {s.cutOut} m/s
                    {s.notes ? <span className="ml-1 text-amber-600">· {s.notes}</span> : null}
                  </div>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">{s.powerCurve.length}pt</span>
                {expandedBuiltin === s.key ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
              </div>
              {expandedBuiltin === s.key && (
                <div className="border-t border-[#d6e8ff] px-4 py-3">
                  <PowerCurveChart points={s.powerCurve} cutIn={s.cutIn} cutOut={s.cutOut} ratedMw={s.ratedMw} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* DB 커스텀 커브 */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">커스텀 커브 (DB 저장 · 시뮬레이션에서 선택 가능)</h2>
        {loading ? (
          <p className="text-sm text-slate-400">로딩 중…</p>
        ) : curves.length === 0 ? (
          <p className="text-sm text-slate-400">등록된 커스텀 커브 없음. CSV 업로드 또는 새 커브 등록으로 추가하세요.</p>
        ) : (
          <div className="space-y-2">
            {curves.map((c) => (
              <div key={c.id} className="rounded-xl border border-[#d6e8ff] bg-white/70">
                <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                  <Wind className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      {c.rated_mw}MW · IEC {c.iec_class ?? "-"} · 허브 {c.hub_height_m ?? "-"}m · {c.curve_data.length}포인트
                      {c.notes ? ` · ${c.notes}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => exportCsv(c)} title="CSV 내보내기"
                      className="rounded border border-[#d6e8ff] p-1.5 text-slate-500 hover:bg-slate-50">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { setEditId(c.id); setEditForm({ name: c.name, rated_mw: c.rated_mw, iec_class: c.iec_class, cut_in: c.cut_in, rated_speed: c.rated_speed, cut_out: c.cut_out, hub_height_m: c.hub_height_m, rotor_diameter_m: c.rotor_diameter_m, curve_data: [...c.curve_data], notes: c.notes }); setExpandedId(c.id); }}
                      className="rounded border border-[#d6e8ff] px-2 py-1.5 text-xs text-blue-600 hover:bg-blue-50">편집</button>
                    <button onClick={() => remove(c.id)}
                      className="rounded border border-red-200 p-1.5 text-red-500 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {expandedId === c.id ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </div>

                {expandedId === c.id && (
                  <div className="border-t border-[#d6e8ff] p-4">
                    {editId === c.id && editForm ? (
                      <div className="space-y-4">
                        <FormFields form={editForm} setForm={setEditForm} />
                        <div className="flex gap-2">
                          <button onClick={() => save(editForm, c.id)} disabled={saving}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-blue-500">
                            {saving ? "저장 중…" : "저장"}
                          </button>
                          <button onClick={() => { setEditId(null); setEditForm(null); }}
                            className="rounded-lg border border-[#d6e8ff] px-4 py-2 text-xs text-slate-600">취소</button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <PowerCurveChart points={c.curve_data} cutIn={c.cut_in} cutOut={c.cut_out} ratedMw={c.rated_mw} />
                        <details className="cursor-pointer">
                          <summary className="text-xs text-slate-500 select-none hover:text-slate-700 mb-2">
                            원시 데이터 ({c.curve_data.length}포인트)
                          </summary>
                          <div className="overflow-x-auto rounded-lg border border-[#d6e8ff]">
                            <table className="text-xs border-collapse min-w-max">
                              <thead>
                                <tr className="bg-slate-50 border-b border-[#d6e8ff]">
                                  <td className="px-3 py-2 font-semibold text-slate-500 whitespace-nowrap sticky left-0 bg-slate-50 border-r border-[#d6e8ff]">풍속 (m/s)</td>
                                  {[...c.curve_data].sort((a, b) => a.ws - b.ws).map((p, i) => (
                                    <td key={i} className="px-3 py-2 text-center font-medium text-slate-600 whitespace-nowrap border-r border-[#d6e8ff] last:border-r-0">{p.ws}</td>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td className="px-3 py-2 font-semibold text-slate-500 whitespace-nowrap sticky left-0 bg-white border-r border-[#d6e8ff]">출력 (kW)</td>
                                  {[...c.curve_data].sort((a, b) => a.ws - b.ws).map((p, i) => (
                                    <td key={i} className={`px-3 py-2 text-center whitespace-nowrap border-r border-[#d6e8ff] last:border-r-0 ${p.kw === 0 ? "text-slate-300" : p.kw >= c.rated_mw * 1000 * 0.99 ? "text-blue-600 font-semibold bg-blue-50" : "text-slate-700"}`}>
                                      {p.kw.toLocaleString()}
                                    </td>
                                  ))}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
