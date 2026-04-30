# Claude 작업 패키지 — WMS 교육자료 제작

아래 내용을 **그대로 Claude에 붙여넣어** 작업하세요.

---

## 역할
당신은 WindTree WMS 시스템의 기술 문서를 교육자료로 바꾸는 시니어 솔루션 아키텍트입니다.

## 목표
코드/스키마 기반으로 **실무 교육용 자료**를 제작합니다.
대상은 ①운영 실무자(비개발) ②개발/운영 담당자(기술)입니다.

## 최종 산출물 (반드시 모두)
1. `WMS_교육자료_실무자용_60분.md`
2. `WMS_교육자료_기술심화_90분.md`
3. `WMS_교육자료_PPT_슬라이드원고.md`  
   - 슬라이드 번호별
   - 화면 문구 + 발표자 스크립트(각 슬라이드 1~2분)
4. `WMS_운영장애_트러블슈팅_런북.md`
5. `WMS_교육_QA_예상질문30.md`

## 프로젝트 컨텍스트
- 프로젝트 루트: `projects/wms-dashboard`
- 주요 기술: Next.js + Supabase(Auth/Postgres/RLS) + Cloudflare Worker
- 핵심 테이블: `sites`, `user_site_access`, `measurements`, `daily_stats`, `upload_history`
- 핵심 기능:
  - 사이트 관리(수동/RLD 업로드)
  - 데이터 이력/성공실패 모니터링
  - 권한 관리(Admin/Viewer)
  - 동기화 스케줄(Worker `/cron-config`)

## 반드시 참고할 파일
- `README.md`
- `supabase/schema.sql`
- `app/dashboard/page.tsx`
- `app/dashboard/data/page.tsx`
- `app/dashboard/sites/SitesContent.tsx`
- `app/dashboard/sites/SiteDetail.tsx`
- `app/dashboard/users/page.tsx`
- `app/dashboard/settings/page.tsx`
- `lib/services/*.ts`
- `hooks/*.ts`

## 작성 규칙
- 코드에 없는 내용은 추정 시 **[가정]** 태그로 명시
- 운영자가 바로 쓰게끔 체크리스트/표/순서도 형태 우선
- 슬라이드는 텍스트 과밀 금지 (핵심 3~5 bullet)
- 장애 대응은 “증상 → 원인확인 → 조치 → 재발방지” 포맷 고정
- 보안 관련 항목(권한/RLS/키 관리) 별도 강조 섹션 포함

## 산출물 품질 기준
- 초급자도 1회 교육 후 운영 가능
- 장애 발생 시 런북만 보고 1차 대응 가능
- 개발자 인수인계 문서로 재사용 가능

## 출력 형식
- 각 파일은 독립 Markdown
- 파일 상단에 버전/작성일/대상자 명시
- 마지막에 “현행 코드 기준 리스크 5개 + 개선 우선순위” 필수 추가

---

## 참고 요약(현재 분석 기반)
- `/dashboard`는 사이트 상태/KPI/실패 피드/업로드 추이 중심
- `/dashboard/data`는 업로드 이력 + 동기화 요일 조회(`GET /cron-config`)
- `/dashboard/settings`는 동기화 요일 변경(`POST /cron-config`)
- `/dashboard/sites`는 수동 등록 + RLD 업로드(`.../upload-rld`)
- `/dashboard/users`는 관리자 전용 권한 부여 흐름(`invite-user-site` 함수 의존)
- RLS 정책은 `schema.sql`에 정의되어 Admin/Viewer 접근 통제

---

## 추가 요청
각 문서 마지막에 다음 2개를 포함하세요.
1) “교육 후 실무 투입 체크리스트 (10항목)”
2) “다음 분기 개선 과제 Top 7”
