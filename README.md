# WindTree WMS Dashboard

기상 측정 데이터 통합 관리 플랫폼

## 기술 스택

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend/DB**: Supabase (Auth + PostgreSQL)
- **Charts**: Recharts
- **배포**: Cloudflare Pages

## 로컬 개발

```bash
# 의존성 설치
npm install

# 환경변수 설정
cp .env.local.example .env.local
# .env.local에 Supabase 키 입력

# 개발 서버 시작
npm run dev
```

## Supabase 설정

1. [supabase.com](https://supabase.com) 에서 새 프로젝트 생성
2. `supabase/schema.sql` 실행 (SQL Editor)
3. `.env.local`에 URL, anon key, service_role key 입력

## Cloudflare Pages 배포

1. GitHub 저장소에 push
2. Cloudflare Pages → Create a project → GitHub 연결
3. Build settings:
   - Framework: Next.js
   - Build command: `npm run build`
   - Build output: `.next`
4. Environment variables에 Supabase 키 추가
5. Save and Deploy

## 관리자 계정 생성

Supabase Dashboard → Authentication → Users → Invite user
생성 후 user_metadata에 role: "admin" 추가:

```sql
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'
WHERE email = 'admin@windtreeeng.com';
```

## 데이터 파이프라인

Gmail → RLD 다운로드 → NRG Cloud 변환 → meas.txt → Supabase 적재

`scripts/sync_data.py` 로 수동 실행 가능 (추후 cron 자동화)
