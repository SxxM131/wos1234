#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");
const content = readFileSync(envPath, "utf8");
const vars = Object.fromEntries(
  content
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("="))
    .map(([k, ...v]) => [k.trim(), v.join("=").trim()])
);

const supabase = createClient(
  vars.NEXT_PUBLIC_SUPABASE_URL,
  vars.SUPABASE_SERVICE_ROLE_KEY
);

const { count, error: slotsErr } = await supabase
  .from("slots")
  .select("*", { count: "exact", head: true });

if (slotsErr) {
  console.error("❌ DB 연결/테이블 오류:", slotsErr.message);
  if (slotsErr.message.includes("does not exist")) {
    console.error("   → Supabase SQL Editor에서 supabase/schema.sql 을 실행하세요.");
  }
  process.exit(1);
}

const { data: settings } = await supabase.from("settings").select("key, value");
console.log("✅ Supabase 연결 성공");
console.log(`✅ slots 테이블: ${count ?? 0}행 (144행이면 정상)`);
console.log("✅ settings:", settings?.map((s) => s.key).join(", ") ?? "없음");
