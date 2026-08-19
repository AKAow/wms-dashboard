-- 월간 리포트 다운로드(엑셀)에 들어가는 고객사/프로젝트/작성자 정보를
-- 사이트별로 관리하기 위한 컬럼 추가. 미입력 시 NULL이며,
-- 다운로드 코드는 NULL이면 템플릿 원본 값을 그대로 둔다.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS report_client TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS report_project_name TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS report_writer TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS report_approval TEXT;
