#!/usr/bin/env python3
"""
MCP (Measure-Correlate-Predict): 현장 측정 풍속 vs ERA5 장기 데이터 상관분석
사이트 측정값(Supabase measurements.ch1, 10분)과 ERA5 100m 풍속(시간) 비교 →
선형회귀로 측정 기간을 장기 데이터에 투영, 장기 대표 풍속 산출.

사용법:
  python3 scripts/mcp_correlate.py --site 017546

전제:
  - data/era5/{site_number}/era5_*.nc 파일 존재 (download_era5.py로 미리 다운로드)
  - .env.local 에 SUPABASE_EMAIL / SUPABASE_PASSWORD 설정
"""

import os
import sys
import glob
import argparse
import requests
import numpy as np
import pandas as pd
import xarray as xr
from scipy import stats

try:
    from dotenv import load_dotenv
    _root = os.path.join(os.path.dirname(__file__), "..")
    load_dotenv(os.path.join(_root, ".env.local"))
except ImportError:
    pass

parser = argparse.ArgumentParser()
parser.add_argument("--site", required=True, help="사이트 번호 (예: 017546)")
args = parser.parse_args()

SUPABASE_URL = "https://gxngbvahywpaaavkkrfx.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4bmdidmFoeXdwYWFhdmtrcmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxODE0NjYsImV4cCI6MjA5MDc1NzQ2Nn0.ADoZo0J1KJonkrUZN3XLPGi6vRrDgKM1I17ygN2RMeM"

EMAIL = os.environ.get("SUPABASE_EMAIL", "")
PASSWORD = os.environ.get("SUPABASE_PASSWORD", "")
if not EMAIL:
    EMAIL = input("관리자 이메일: ").strip()
if not PASSWORD:
    import getpass
    PASSWORD = getpass.getpass("비밀번호: ")

login_res = requests.post(
    f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
    headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
    json={"email": EMAIL, "password": PASSWORD}, timeout=10,
)
if login_res.status_code != 200:
    print(f"로그인 실패: {login_res.text[:200]}"); sys.exit(1)
ACCESS_TOKEN = login_res.json()["access_token"]
headers = {"apikey": ANON_KEY, "Authorization": f"Bearer {ACCESS_TOKEN}"}
print("로그인 성공")

# ── 사이트 좌표 조회 ───────────────────────────────────────
site_res = requests.get(
    f"{SUPABASE_URL}/rest/v1/sites",
    headers=headers,
    params={"select": "id,name,latitude,longitude", "site_number": f"eq.{args.site}"},
    timeout=10,
)
sites = site_res.json()
if not sites:
    print(f"사이트 {args.site} 없음"); sys.exit(1)
site = sites[0]
site_id, lat, lon = site["id"], float(site["latitude"]), float(site["longitude"])
print(f"사이트: {site['name']} lat={lat:.4f} lon={lon:.4f}\n")

# ── ERA5 로드 (해당 사이트 전체 월 파일) ──────────────────
nc_dir = os.path.join(os.path.dirname(__file__), "..", "data", "era5", args.site)
files = sorted(glob.glob(os.path.join(nc_dir, "era5_*.nc")))
if not files:
    print(f"ERA5 파일 없음: {nc_dir}"); sys.exit(1)
print(f"ERA5 파일 {len(files)}개 로드 중...")

ds = xr.open_mfdataset(files, combine="by_coords")
nearest = ds.sel(latitude=lat, longitude=lon, method="nearest")
ws100 = np.sqrt(nearest["u100"] ** 2 + nearest["v100"] ** 2)
era5_df = ws100.to_dataframe(name="ws_era5").reset_index()[["valid_time", "ws_era5"]]
era5_df = era5_df.rename(columns={"valid_time": "ts"}).set_index("ts")
print(f"ERA5 시간당 풍속 {len(era5_df)}행, 기간 {era5_df.index.min()} ~ {era5_df.index.max()}\n")

# ── 측정값 로드 (measurements.ch1, 10분) ──────────────────
print("측정 데이터 조회 중...")
all_rows = []
offset = 0
page = 1000  # Supabase REST 기본 최대 응답 행 수
while True:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/measurements",
        headers=headers,
        params={"select": "timestamp,ch1", "site_id": f"eq.{site_id}", "order": "timestamp",
                "limit": page, "offset": offset},
        timeout=30,
    )
    rows = r.json()
    if not isinstance(rows, list) or not rows:
        break
    all_rows.extend(rows)
    if len(rows) < page:
        break
    offset += page

if not all_rows:
    print("측정 데이터 없음"); sys.exit(1)

meas_df = pd.DataFrame(all_rows)
meas_df["timestamp"] = pd.to_datetime(meas_df["timestamp"]).dt.tz_localize(None)  # UTC→naive (ERA5와 동일 기준)
meas_df = meas_df.dropna(subset=["ch1"]).set_index("timestamp")
print(f"측정값 {len(meas_df)}행, 기간 {meas_df.index.min()} ~ {meas_df.index.max()}\n")

# 시간 단위 평균으로 리샘플 (ERA5와 매칭)
meas_hourly = meas_df["ch1"].resample("1h").mean().rename("ws_meas")

# ── 병합 + 상관분석 ────────────────────────────────────────
merged = pd.merge(meas_hourly, era5_df["ws_era5"], left_index=True, right_index=True, how="inner").dropna()
print(f"매칭된 시간 {len(merged)}개\n")

if len(merged) < 100:
    print("매칭 데이터 부족 (100개 미만). MCP 신뢰도 낮음.")
    sys.exit(1)

slope, intercept, r_value, p_value, std_err = stats.linregress(merged["ws_era5"], merged["ws_meas"])
r2 = r_value ** 2

print("=" * 50)
print("MCP 선형회귀 결과 (측정값 = a × ERA5 + b)")
print("=" * 50)
print(f"  기울기 a    : {slope:.4f}")
print(f"  절편 b      : {intercept:.4f}")
print(f"  R²          : {r2:.4f}")
print(f"  상관계수 r  : {r_value:.4f}")
print(f"  p-value     : {p_value:.2e}")
print()

# ── 장기 대표 풍속 산출 ────────────────────────────────────
era5_df["ws_predicted"] = slope * era5_df["ws_era5"] + intercept
long_term_mean = era5_df["ws_predicted"].mean()
era5_period_mean = era5_df.loc[merged.index.min():merged.index.max(), "ws_era5"].mean()
meas_period_mean = merged["ws_meas"].mean()

print("=" * 50)
print("장기 대표 풍속 추정")
print("=" * 50)
print(f"  측정 기간 평균풍속 (현장)     : {meas_period_mean:.3f} m/s")
print(f"  측정 기간 평균풍속 (ERA5)     : {era5_period_mean:.3f} m/s")
print(f"  ERA5 전체기간 평균            : {era5_df['ws_era5'].mean():.3f} m/s")
print(f"  → MCP 보정 장기 대표풍속      : {long_term_mean:.3f} m/s")
print()
long_term_ratio = long_term_mean / meas_period_mean if meas_period_mean else float("nan")
print(f"  장기/측정 비율: {long_term_ratio:.3f}  ({'측정기간이 평년보다 약함' if long_term_ratio > 1 else '측정기간이 평년보다 강함'})")
print()
if r2 < 0.5:
    print("주의: R² < 0.5 — 상관성 약함. MCP 보정값 신뢰도 낮음. 그리드 좌표/측정높이 재확인 권장.")
elif r2 < 0.7:
    print("참고: R² 0.5~0.7 — 보통 수준. 참고용으로만 사용.")
else:
    print("양호: R² >= 0.7 — 상관성 양호.")
