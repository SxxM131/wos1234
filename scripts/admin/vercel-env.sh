#!/bin/bash
# Vercel 로그인 후 실행: bash scripts/vercel-env.sh
set -e
cd "$(dirname "$0")/.."
source .env.local 2>/dev/null || export $(grep -v '^#' .env.local | xargs)

for env in production preview development; do
  printf '%s' "$NEXT_PUBLIC_SUPABASE_URL" | npx vercel env add NEXT_PUBLIC_SUPABASE_URL "$env" --force
  printf '%s' "$NEXT_PUBLIC_SUPABASE_ANON_KEY" | npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY "$env" --force
  printf '%s' "$SUPABASE_SERVICE_ROLE_KEY" | npx vercel env add SUPABASE_SERVICE_ROLE_KEY "$env" --force
  printf '%s' "$IRON_SESSION_SECRET" | npx vercel env add IRON_SESSION_SECRET "$env" --force
done
echo "✅ Vercel 환경 변수 등록 완료"
