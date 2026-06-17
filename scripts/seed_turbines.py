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

# 컬럼: manufacturer, turbine_type, has_power_curve, has_cp_curve
turbine_list = get_turbine_types(filter_=None, print_out=False)
total = len(turbine_list)
print(f"총 {total}개 기종 발견 (파워커브 보유 기종만 삽입)…")

ok, skip = 0, 0

for _, row in turbine_list.iterrows():
    # v0.2.2 컬럼명: turbine_type (turbine_type_name 아님)
    name = str(row.get("turbine_type", "")).strip()
    if not name:
        skip += 1
        continue

    # 파워커브 없는 기종 건너뜀
    if not row.get("has_power_curve", False):
        skip += 1
        continue

    try:
        # v0.2.2: hub_height 필수 인자 (파워커브 조회용이라 임의값 사용)
        t = WindTurbine(turbine_type=name, hub_height=100)
        pc = t.power_curve
        if pc is None or len(pc) == 0:
            skip += 1
            continue

        # WindPowerLib power_curve: wind_speed(m/s), value(W) → kW 변환
        wind_speeds = pc["wind_speed"].tolist() if hasattr(pc["wind_speed"], "tolist") else list(pc["wind_speed"])
        powers_w    = pc["value"].tolist()      if hasattr(pc["value"],      "tolist") else list(pc["value"])

        curve = [
            {"ws": round(float(ws), 2), "kw": round(float(pw) / 1000, 1)}
            for ws, pw in zip(wind_speeds, powers_w)
        ]

        # 정격 출력: WindTurbine.nominal_power (W)
        rated_mw = float(t.nominal_power or 0) / 1e6

        # 로터 직경: 속성 없으면 None
        rotor = getattr(t, "rotor_diameter", None)

        payload = {
            "name": name,
            "rated_mw": round(rated_mw, 3),
            "hub_height_m": None,   # hub_height는 사이트별 설정이므로 DB엔 저장 안 함
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
            print(f"  OK  {name} ({rated_mw:.2f}MW, {len(curve)}pt)")
        elif res.status_code == 409:
            print(f"  DUP {name}: 이미 존재")
            skip += 1
        else:
            print(f"  ERR {name}: {res.status_code} {res.text[:120]}")
            skip += 1

    except Exception as e:
        print(f"  SKIP {name}: {e}")
        skip += 1

print(f"\n완료 — 삽입 {ok} / 스킵 {skip} / 전체 {total}")
