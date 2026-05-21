#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "IRON_SESSION_SECRET",
];

if (!existsSync(envPath)) {
  console.error("❌ .env.local 파일이 없습니다.");
  console.error("   cp .env.example .env.local 후 Supabase 값을 입력하세요.");
  process.exit(1);
}

const content = readFileSync(envPath, "utf8");
const vars = Object.fromEntries(
  content
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("="))
    .filter(([k]) => k)
    .map(([k, ...v]) => [k.trim(), v.join("=").trim()])
);

let ok = true;
for (const key of required) {
  const val = vars[key];
  if (!val || val.includes("your-") || val.includes("CHANGE")) {
    console.error(`❌ ${key} — 아직 설정되지 않았습니다`);
    ok = false;
  } else {
    console.log(`✅ ${key}`);
  }
}

if (vars.IRON_SESSION_SECRET && vars.IRON_SESSION_SECRET.length < 32) {
  console.error("❌ IRON_SESSION_SECRET는 32자 이상이어야 합니다");
  ok = false;
}

process.exit(ok ? 0 : 1);
