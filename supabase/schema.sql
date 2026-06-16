-- WindTree WMS 데이터베이스 스키마

-- 사이트
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  site_number TEXT UNIQUE NOT NULL,
  description TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  elevation INTEGER,
  location_name TEXT,
  ipack_email TEXT,
  gmail_sync_enabled BOOLEAN DEFAULT false,
  gmail_query TEXT,
  sync_gmail_account TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 사용자-사이트 권한
CREATE TABLE IF NOT EXISTS user_site_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'viewer',
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, site_id)
);

-- 일별 채널 통계
CREATE TABLE IF NOT EXISTS daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  channel TEXT NOT NULL,
  avg_value NUMERIC,
  max_value NUMERIC,
  min_value NUMERIC,
  std_value NUMERIC,
  data_count INTEGER,
  UNIQUE(site_id, date, channel)
);

-- 10분 측정 데이터
CREATE TABLE IF NOT EXISTS measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  ch1 NUMERIC, ch2 NUMERIC, ch3 NUMERIC, ch4 NUMERIC,
  ch5 NUMERIC, ch6 NUMERIC, ch7 NUMERIC, ch8 NUMERIC,
  ch13 NUMERIC, ch14 NUMERIC, ch15 NUMERIC, ch16 NUMERIC,
  ch17 NUMERIC, ch21 NUMERIC, ch22 NUMERIC,
  UNIQUE(site_id, timestamp)
);

-- 데이터 업로드 이력
CREATE TABLE IF NOT EXISTS upload_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'manual',
  file_name TEXT,
  date_range_start DATE,
  date_range_end DATE,
  records_inserted INTEGER,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기존 운영 DB 마이그레이션(안전)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS gmail_sync_enabled BOOLEAN DEFAULT false;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS gmail_query TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS sync_gmail_account TEXT;

-- RLS 활성화
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_site_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_history ENABLE ROW LEVEL SECURITY;

-- 사이트: 인증된 사용자만 접근 가능한 사이트 보기
CREATE POLICY "sites_select" ON sites
  FOR SELECT TO authenticated
  USING (
    is_active = true AND (
      -- 관리자는 모두 볼 수 있음 (user_metadata로 구분)
      EXISTS (
        SELECT 1 FROM auth.users
        WHERE id = auth.uid()
        AND raw_user_meta_data->>'role' = 'admin'
      )
      OR
      -- 권한 부여된 사이트만
      EXISTS (
        SELECT 1 FROM user_site_access
        WHERE user_id = auth.uid() AND site_id = sites.id
      )
    )
  );

-- 관리자만 사이트 수정
CREATE POLICY "sites_admin" ON sites
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- measurements: 접근 가능한 사이트만
CREATE POLICY "measurements_select" ON measurements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_access
      WHERE user_id = auth.uid() AND site_id = measurements.site_id
    )
    OR
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- daily_stats: 동일
CREATE POLICY "daily_stats_select" ON daily_stats
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_access
      WHERE user_id = auth.uid() AND site_id = daily_stats.site_id
    )
    OR
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- 샘플 데이터
INSERT INTO sites (name, site_number, location_name, latitude, longitude, elevation, ipack_email, gmail_sync_enabled, gmail_query, is_active)
VALUES
  ('Wando Daesin', '017546', 'Junnam Wando', 34.3389216, 126.6761300, 325, '447498801685@packet-mail.net', false, null, true)
ON CONFLICT (site_number) DO NOTHING;
