#!/usr/bin/env python3
"""
WindPowerLib → Supabase turbine_curves 시드 스크립트
사용법:
  pip install windpowerlib requests
  python3 scripts/seed_turbines.py
"""

import sys
import requests

try:
    from windpowerlib.data import get_turbine_types
    from windpowerlib import WindTurbine
except ImportError:
    print("windpowerlib 미설치. 실행: pip install windpowerlib")
    sys.exit(1)

SUPABASE_URL = input("Supabase URL (예: https://xxxx.supabase.co): ").strip().rstrip("/")
SERVICE_KEY  = input("service_role 키: ").strip()

headers = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}
endpoint = f"{SUPABASE_URL}/rest/v1/turbine_curves"

turbine_list = get_turbine_types(filter_=None, print_out=False)
total = len(turbine_list)
print(f"총 {total}개 기종 처리 시작…")

ok, skip = 0, 0

for _, row in turbine_list.iterrows():
    name = str(row.get("turbine_type_name", "")).strip()
    if not name:
        skip += 1
        continue

    try:
        t = WindTurbine(turbine_type=name)
        pc = t.power_curve
        if pc is None or pc.empty:
            skip += 1
            continue

        # WindPowerLib power_curve value 단위: W → kW 변환
        curve = [
            {"ws": round(float(ws), 2), "kw": round(float(pw) / 1000, 1)}
            for ws, pw in zip(pc["wind_speed"], pc["value"])
        ]

        rated_mw = float(row.get("nominal_power") or 0) / 1e6
        hub   = row.get("hub_height")
        rotor = row.get("rotor_diameter")

        payload = {
            "name": name,
            "rated_mw": round(rated_mw, 3),
            "hub_height_m":    int(hub)   if hub   and str(hub)   != "nan" else None,
            "rotor_diameter_m": int(rotor) if rotor and str(rotor) != "nan" else None,
            "cut_in": 3,
            "rated_speed": 12,
            "cut_out": 25,
            "curve_data": curve,
            "notes": "WindPowerLib OEDB",
            "is_builtin": False,
        }

        res = requests.post(endpoint, headers=headers, json=payload, timeout=10)
        if res.status_code in (200, 201):
            ok += 1
            print(f"  OK  {name} ({rated_mw:.1f}MW, {len(curve)}pt)")
        else:
            print(f"  ERR {name}: {res.status_code} {res.text[:120]}")
            skip += 1

    except Exception as e:
        print(f"  SKIP {name}: {e}")
        skip += 1

print(f"\n완료 — 삽입 {ok} / 스킵 {skip} / 전체 {total}")
