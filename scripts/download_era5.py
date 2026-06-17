#!/usr/bin/env python3
"""
Supabase sites 테이블 → 활성 사이트 전체 ERA5 다운로드
service_role 키 불필요 — 관리자 이메일/비밀번호로 로그인

사용법:
  python3 scripts/download_era5.py [--years 2015-2024]
  (자격증명은 .env.local 또는 프롬프트)

.env.local 예시:
  SUPABASE_EMAIL=admin@example.com
  SUPABASE_PASSWORD=yourpassword

출력:
  data/era5/{site_number}/era5_{year}.nc
"""

import cdsapi
import os
import sys
import argparse
import requests

# .env.local 자동 로드
try:
    from dotenv import load_dotenv
    _root = os.path.join(os.path.dirname(__file__), "..")
    load_dotenv(os.path.join(_root, ".env.local"))
except ImportError:
    pass

# ── 인자 파싱 ──────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--years", default="2015-2024", help="연도 범위 (예: 2020-2024)")
args = parser.parse_args()

start_year, end_year = (int(y) for y in args.years.split("-"))
YEARS = [str(y) for y in range(start_year, end_year + 1)]

MARGIN = 0.5

# ── Supabase 설정 (anon 키는 프로젝트 공개값 사용) ─────────
SUPABASE_URL = "https://gxngbvahywpaaavkkrfx.supabase.co"
ANON_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4bmdidmFoeXdwYWFhdmtrcmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxODE0NjYsImV4cCI6MjA5MDc1NzQ2Nn0.ADoZo0J1KJonkrUZN3XLPGi6vRrDgKM1I17ygN2RMeM"

EMAIL    = os.environ.get("SUPABASE_EMAIL", "")
PASSWORD = os.environ.get("SUPABASE_PASSWORD", "")

if not EMAIL:
    EMAIL = input("관리자 이메일: ").strip()
if not PASSWORD:
    import getpass
    PASSWORD = getpass.getpass("비밀번호: ")

# 로그인 → JWT 발급
login_res = requests.post(
    f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
    headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
    json={"email": EMAIL, "password": PASSWORD},
    timeout=10,
)
if login_res.status_code != 200:
    print(f"로그인 실패: {login_res.text[:200]}")
    sys.exit(1)

ACCESS_TOKEN = login_res.json()["access_token"]
print("로그인 성공\n")

headers = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ACCESS_TOKEN}",
}

# ── 활성 사이트 조회 ───────────────────────────────────────
res = requests.get(
    f"{SUPABASE_URL}/rest/v1/sites",
    headers=headers,
    params={"select": "site_number,name,latitude,longitude", "is_active": "eq.true"},
    timeout=10,
)
if res.status_code != 200:
    print(f"사이트 조회 실패: {res.status_code} {res.text[:200]}")
    sys.exit(1)

sites = res.json()
valid = [s for s in sites if s.get("latitude") and s.get("longitude")]
print(f"활성 사이트 {len(valid)}개 발견\n")

if not valid:
    print("좌표 있는 사이트 없음. sites 테이블 latitude/longitude 확인 요망.")
    sys.exit(1)

# ── ERA5 다운로드 ──────────────────────────────────────────
c = cdsapi.Client()

for site in valid:
    site_no = site["site_number"]
    name    = site["name"]
    lat     = float(site["latitude"])
    lon     = float(site["longitude"])

    out_dir = os.path.join(os.path.dirname(__file__), "..", "data", "era5", site_no)
    os.makedirs(out_dir, exist_ok=True)

    print(f"── {name} ({site_no})  lat={lat:.4f} lon={lon:.4f}")

    for year in YEARS:
        # 월별로 쪼개서 요청 (연간 일괄 요청 시 CDS 용량 초과)
        for month in range(1, 13):
            out_path = os.path.join(out_dir, f"era5_{year}_{month:02d}.nc")
            if os.path.exists(out_path):
                print(f"  SKIP {year}-{month:02d}: 파일 존재")
                continue

            print(f"  요청 중: {year}-{month:02d}...")
            c.retrieve(
                "reanalysis-era5-single-levels",
                {
                    "product_type": "reanalysis",
                    "variable": [
                        "100m_u_component_of_wind",
                        "100m_v_component_of_wind",
                        "surface_pressure",
                        "2m_temperature",
                    ],
                    "year": year,
                    "month": f"{month:02d}",
                    "day":   [f"{d:02d}" for d in range(1, 32)],
                    "time":  [f"{h:02d}:00" for h in range(24)],
                    "area":  [lat + MARGIN, lon - MARGIN, lat - MARGIN, lon + MARGIN],
                    "format": "netcdf",
                },
                out_path,
            )
            print(f"  저장: {out_path}")

print("\n전체 완료.")
