import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env variables
const root = resolve(__dirname, "..");
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

async function testCsv() {
  console.log("🧪 Testing CSV export functionality...");
  
  // Get current cycle ID
  const { data: cycleData } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "current_cycle_id")
    .single();
  const cycleId = parseInt(cycleData?.value ?? "1");
  console.log(`Current Cycle ID: ${cycleId}`);

  // Fetch all slots from the slots table
  const { data: slots, error: slotsError } = await supabase
    .from("slots")
    .select("id, day_of_week, office_type, block_start_utc, slot_index, is_active");
  if (slotsError || !slots) {
    throw new Error(`Failed to fetch slots: ${slotsError?.message}`);
  }

  // Fetch all assigned reservations for this cycle
  const { data: reservations, error: resError } = await supabase
    .from("reservations")
    .select("slot_id, player_id, status, players(game_id, name, alliance, speedup_vp, speedup_mo)")
    .eq("cycle_id", cycleId)
    .eq("status", "assigned");
  if (resError) {
    throw new Error(`Failed to fetch reservations: ${resError?.message}`);
  }

  // Map reservations to their slot IDs
  const resMap = new Map();
  if (reservations) {
    for (const r of reservations) {
      if (r.slot_id !== null) {
        resMap.set(r.slot_id, r);
      }
    }
  }

  const days = ["mon", "tue", "thu"];
  const dayNames = {
    mon: "월요일",
    tue: "화요일",
    thu: "목요일",
  };

  const escape = (val: any) => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = "요일,구간(UTC),슬롯시작(UTC),슬롯시작(KST),슬롯번호(1~4),게임ID,이름,연맹,스피드업(days),상태";
  const sections = [];

  for (const d of days) {
    const daySlots = slots.filter((s) => s.day_of_week === d);
    
    // Sort chronologically: block_start_utc ASC, slot_index ASC
    daySlots.sort((a, b) => {
      if (a.block_start_utc !== b.block_start_utc) {
        return a.block_start_utc - b.block_start_utc;
      }
      return a.slot_index - b.slot_index;
    });

    const rows = daySlots.map((s) => {
      const totalHalfHoursUtc = s.block_start_utc * 2 + s.slot_index;
      const utcHour = Math.floor(totalHalfHoursUtc / 2) % 24;
      const utcMin = (totalHalfHoursUtc % 2) * 30;
      const pad = (n: number) => String(n).padStart(2, "0");
      const slotStartUtcStr = `${pad(utcHour)}:${pad(utcMin)}`;

      const totalHalfHoursKst = totalHalfHoursUtc + 18;
      const kstHour = Math.floor(totalHalfHoursKst / 2) % 24;
      const kstMin = (totalHalfHoursKst % 2) * 30;
      const nextDay = Math.floor(totalHalfHoursKst / 2) >= 24;
      const slotStartKstStr = `${pad(kstHour)}:${pad(kstMin)}${nextDay ? " (+1일)" : ""}`;

      const utcBlockStr = `${pad(s.block_start_utc)}:00~${pad(s.block_start_utc + 2)}:00`;
      const dayName = dayNames[s.day_of_week as keyof typeof dayNames] ?? s.day_of_week;
      const slotNum = s.slot_index + 1;

      const r = resMap.get(s.id);
      let gameId = "";
      let name = "";
      let alliance = "";
      let speedup = "";
      let status = "";

      if (r) {
        gameId = String(r.player_id ?? "");
        status = r.status ?? "";

        const p = r.players;

        if (!p) {
          name = "(데이터오류)";
          alliance = "(데이터오류)";
          speedup = "(데이터오류)";
        } else {
          name = p.name;
          alliance = p.alliance;
          const speedupVal = s.office_type === "VP" ? p.speedup_vp : p.speedup_mo;
          speedup = String(speedupVal);
        }
      }

      return [
        escape(dayName),
        escape(utcBlockStr),
        escape(slotStartUtcStr),
        escape(slotStartKstStr),
        escape(slotNum),
        escape(gameId),
        escape(name),
        escape(alliance),
        escape(speedup),
        escape(status),
      ].join(",");
    });

    sections.push([header, ...rows].join("\n"));
  }

  const csvContent = sections.join("\n\n");
  console.log("\nGenerated CSV statistics:");
  const lines = csvContent.split("\n");
  console.log(`Total Lines in CSV: ${lines.length}`);
  
  // Assertions
  // Expect exactly 149 lines (3 headers, 3 x 48 data rows = 144 data lines, 2 blank spacer rows)
  if (lines.length === 149) {
    console.log("✅ Line count assertion passed! (Exactly 149 rows)");
  } else {
    console.error(`❌ Line count assertion failed! Expected 149 rows, got ${lines.length}`);
  }

  // Print first few lines of each section
  console.log("\n--- Monday Section Start (Lines 1-5) ---");
  lines.slice(0, 5).forEach((l, idx) => console.log(`${idx + 1}: ${l}`));

  console.log("\n--- Tuesday Section Start (Lines 50-55) ---");
  lines.slice(49, 55).forEach((l, idx) => console.log(`${idx + 50}: ${l}`));

  console.log("\n--- Thursday Section Start (Lines 99-104) ---");
  lines.slice(98, 104).forEach((l, idx) => console.log(`${idx + 99}: ${l}`));

  console.log("\n--- Thursday End / Last Lines (Lines 144-149) ---");
  lines.slice(143, 149).forEach((l, idx) => console.log(`${idx + 144}: ${l}`));
}

testCsv().catch(console.error);
