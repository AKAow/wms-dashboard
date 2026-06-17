#!/usr/bin/env python3
"""
WindPowerLib → turbine_curves INSERT SQL 생성기
사용법:
  pip install windpowerlib
  python3 scripts/generate_turbine_sql.py > turbine_seed.sql
→ 생성된 turbine_seed.sql을 Supabase SQL Editor에 붙여넣기
"""

import sys
import json

try:
    from windpowerlib.data import get_turbine_types
    from windpowerlib import WindTurbine
except ImportError:
    print("windpowerlib 미설치. 실행: pip install windpowerlib", file=sys.stderr)
    sys.exit(1)

def escape(s):
    return s.replace("'", "''")

df = get_turbine_types(filter_=None, print_out=False)
has_pc = df[df["has_power_curve"] == True]

print("-- WindPowerLib OEDB 터빈 파워커브 시드 데이터")
print(f"-- 생성: {len(has_pc)}개 기종 (파워커브 보유 기종만)")
print("-- Supabase SQL Editor에 붙여넣기\n")

ok, skip = 0, 0

for _, row in has_pc.iterrows():
    name = str(row.get("turbine_type", "")).strip()
    if not name:
        skip += 1
        continue

    try:
        t = WindTurbine(turbine_type=name, hub_height=100)
        pc = t.power_curve
        if pc is None or len(pc) == 0:
            print(f"-- SKIP {name}: 파워커브 없음", file=sys.stderr)
            skip += 1
            continue

        ws_list = pc["wind_speed"].tolist()
        pw_list = pc["value"].tolist()

        curve = [
            {"ws": round(float(ws), 2), "kw": round(float(pw) / 1000, 1)}
            for ws, pw in zip(ws_list, pw_list)
        ]
        curve_json = json.dumps(curve, ensure_ascii=False)

        rated_mw = round(float(t.nominal_power or 0) / 1e6, 3)
        rotor = getattr(t, "rotor_diameter", None)
        rotor_val = int(rotor) if rotor and str(rotor) != "nan" else "NULL"

        print(
            f"INSERT INTO turbine_curves "
            f"(name, rated_mw, rotor_diameter_m, cut_in, rated_speed, cut_out, curve_data, notes, is_builtin) "
            f"VALUES ("
            f"'{escape(name)}', {rated_mw}, {rotor_val}, 3, 12, 25, "
            f"'{escape(curve_json)}'::jsonb, 'WindPowerLib OEDB', false"
            f") ON CONFLICT DO NOTHING;"
        )
        ok += 1

    except Exception as e:
        print(f"-- SKIP {name}: {e}", file=sys.stderr)
        skip += 1

print(f"\n-- 완료: {ok}개 생성, {skip}개 스킵", file=sys.stderr)
