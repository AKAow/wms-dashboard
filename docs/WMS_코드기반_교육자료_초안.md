# WMS 시스템 코드기반 교육자료 (초안)

## 1) 교육 목표
- WMS 대시보드의 **구조/데이터 흐름/운영 포인트**를 코드 기준으로 이해한다.
- 실무자가 장애 시 **어디를 먼저 확인해야 하는지** 알 수 있다.
- 사이트 추가, 데이터 확인, 권한 관리, 동기화 스케줄 변경까지 운영 루틴을 익힌다.

---

## 2) 시스템 한눈에 보기

### 기술 스택
- Frontend: Next.js(App Router) + TypeScript + Tailwind + Recharts
- Backend: Supabase(Auth + PostgreSQL + RLS)
- 외부 동기화: Cloudflare Worker(RLD 업로드/cron 설정 API)

### 핵심 데이터 흐름
1. RLD 파일 수집(메일/수동)
2. Worker가 파싱/변환 후 DB 적재
3. `measurements`(원시 10분 데이터), `daily_stats`(일별 집계), `upload_history`(이력) 반영
4. 대시보드에서 시각화/리포트 다운로드

---

## 3) 코드 구조

### 라우팅
- `/login` : 로그인
- `/dashboard` : 운영 대시보드(사이트 현황, 실패 알림, 업로드 추이)
- `/dashboard/data` : 업로드 이력/동기화 상태
- `/dashboard/sites` : 사이트 목록/수정/RLD 업로드
- `/dashboard/users` : 사용자 권한 관리
- `/dashboard/settings` : 동기화 요일 설정

### 주요 폴더
- `app/`: 화면
- `hooks/`: 인증/사이트/업로드 로딩 훅
- `lib/services/`: Supabase 질의 로직
- `supabase/schema.sql`: DB 구조 + RLS 정책
- `worker/`: Worker 관련 코드

---

## 4) DB 설계 핵심

### 주요 테이블
- `sites`: 사이트 마스터(번호, 위치, Gmail 동기화 여부)
- `user_site_access`: 사용자-사이트 권한 매핑
- `measurements`: 10분 단위 채널 데이터
- `daily_stats`: 일별 채널 통계(avg/max/min/std)
- `upload_history`: 업로드 성공/실패 이력

### 권한(RLS)
- Admin: 전체 사이트 접근/수정 가능
- Viewer: 부여된 사이트만 조회
- 정책은 `supabase/schema.sql` 기준으로 동작

---

## 5) 화면별 실무 포인트

### 5-1. 대시보드(`/dashboard`)
- KPI: 전체/활성 사이트, 최근 7일 업로드, 최근 30일 실패
- 실패 피드: 실패 건만 빠르게 모니터링
- 운영 목록: 사이트별 최근 동기화 시각 확인

### 5-2. 데이터 관리(`/dashboard/data`)
- Worker `/cron-config`로 동기화 요일 표시
- 사이트별 성공/실패 요약
- 업로드 이력 필터(사이트별)

### 5-3. 사이트 관리(`/dashboard/sites`)
- 수동 사이트 추가/수정
- RLD 업로드 시 사이트번호 자동 인식 → 신규 사이트 자동 생성 가능
- 사이트별 Gmail 쿼리(없으면 사이트번호 기반 자동검색)

### 5-4. 사용자 관리(`/dashboard/users`)
- 관리자만 접근
- `invite-user-site` 함수로 사용자 초대/권한 부여
- Admin/Viewer 역할 분리 운영

### 5-5. 설정(`/dashboard/settings`)
- 동기화 요일(주 1회 06:00 KST) 변경
- Worker `/cron-config` POST로 반영

---

## 6) 시뮬레이션(사이트 상세)
- 탭: Overview / 일별 / 월별 / 사업성 시뮬레이션
- P50/P75/P90은 풍속 기반 추정치(보증값 아님)
- 연식 구간별 손실률 반영(예: 6~10년 15%)
- 월간 엑셀 다운로드 제공

---

## 7) 운영 장애 대응 체크리스트

### A. 로그인 안 됨
1. Supabase Auth 사용자 존재 확인
2. 네트워크/도메인 확인
3. 세션 만료 여부 확인

### B. 데이터가 안 보임
1. `sites`에 활성 사이트 존재 확인
2. `user_site_access` 권한 확인
3. RLS 정책 충돌 여부 확인

### C. 업로드 실패 증가
1. `upload_history.status=failed` + `error_message` 확인
2. Worker 엔드포인트 응답 확인
3. 파일 포맷/RLD 파싱 실패 여부 확인

### D. 스케줄 변경 반영 안 됨
1. `/cron-config` GET/POST 응답 확인
2. Worker 배포 버전 확인
3. 요일 값(월~일) 유효성 확인

---

## 8) 교육 실습 시나리오 (60분)

### Part 1 (15분): 구조 이해
- 테이블 5개와 화면 5개 매핑
- 권한 구조(Admin/Viewer) 설명

### Part 2 (20분): 운영 실습
- 사이트 추가(수동)
- RLD 업로드 1건 처리
- 업로드 이력에서 성공 확인

### Part 3 (15분): 장애 대응
- 실패 케이스 확인(`upload_history`)
- 원인 추적(Worker/권한/데이터)

### Part 4 (10분): 리포트
- 월별 통계 확인
- 엑셀 다운로드
- 사업성 시뮬레이션 지표 읽는 법

---

## 9) 개선 권장사항(코드 기반)
1. Supabase URL/키 등 민감정보는 하드코딩 대신 환경변수로 통일
2. `users` 페이지의 관리자 판별 로직을 RLS/서버 정책과 일치시키기
3. Worker 연동 실패 시 사용자 메시지(재시도 가이드) 강화
4. 시뮬레이션 계산식 문서화(가정치/한계) 별도 부록 제공

---

## 10) 강사용 한 줄 요약
- “WMS는 **사이트-권한-데이터-이력** 4축으로 운영되며, 장애 대응은 `upload_history → Worker → 권한(RLS)` 순서로 보면 대부분 해결됩니다.”
