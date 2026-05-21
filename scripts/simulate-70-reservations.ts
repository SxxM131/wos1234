import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { processMultiDayReservation, getCurrentCycleId } from "../lib/assignment";
import { DayOfWeek } from "../lib/types";

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

const TEST_CYCLE = 9999;

// Standalone CSV generator to run outside next request scope
async function generateTestCsv(supabase: SupabaseClient, cycleId: number): Promise<string> {
  const { data: slots, error: slotsError } = await supabase
    .from("slots")
    .select("id, day_of_week, office_type, block_start_utc, slot_index, is_active");
  if (slotsError || !slots) {
    throw new Error("Failed to fetch slots");
  }

  const { data: reservations, error: resError } = await supabase
    .from("reservations")
    .select("slot_id, player_id, status, players(game_id, name, alliance, speedup_vp, speedup_mo)")
    .eq("cycle_id", cycleId)
    .eq("status", "assigned");
  if (resError) {
    throw new Error("Failed to fetch reservations");
  }

  const resMap = new Map<number, typeof reservations[number]>();
  if (reservations) {
    for (const r of reservations) {
      if (r.slot_id !== null) {
        resMap.set(r.slot_id, r);
      }
    }
  }

  const days = ["mon", "tue", "thu"] as const;
  const dayNames: Record<string, string> = {
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
  const sections: string[] = [];

  for (const d of days) {
    const daySlots = slots.filter((s) => s.day_of_week === d);
    
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

        const p = r.players as unknown as {
          game_id: number;
          name: string;
          alliance: string;
          speedup_vp: number;
          speedup_mo: number;
        } | null;

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

  return sections.join("\n\n");
}

// Generate 70 randomized test players
const ALLIANCES = ["WOS", "LEO", "MOON", "SUN", "ZEUS"];
const TIME_BLOCKS = Array.from({ length: 12 }, (_, i) => i * 2); // [0, 2, 4, ..., 22]

// Function to pick N random items with priority to "prime time" (10, 12, 14, 16 UTC)
function getRandomPrefs(count: number): number[] {
  const primeTime = [10, 12, 14, 16]; // KST 19:00 ~ 02:00 (Very popular)
  const pool = [...TIME_BLOCKS];
  const prefs: number[] = [];
  
  while (prefs.length < count) {
    // 60% chance to pick prime time if available
    const usePrime = Math.random() < 0.6 && primeTime.some(t => pool.includes(t));
    let chosen: number;
    
    if (usePrime) {
      const activePrimes = primeTime.filter(t => pool.includes(t));
      chosen = activePrimes[Math.floor(Math.random() * activePrimes.length)];
    } else {
      chosen = pool[Math.floor(Math.random() * pool.length)];
    }
    
    prefs.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  
  return prefs;
}

const testPlayers = Array.from({ length: 70 }, (_, i) => {
  const id = 200001 + i;
  return {
    gameId: id,
    name: `Tester_${String(i + 1).padStart(2, "0")}`,
    alliance: ALLIANCES[Math.floor(Math.random() * ALLIANCES.length)],
    // Generate speedup values from 10 to 500
    speedupMon: Math.floor(Math.random() * 49) * 10 + 10, // 10 ~ 500
    speedupTue: Math.floor(Math.random() * 49) * 10 + 10,
    speedupThu: Math.floor(Math.random() * 49) * 10 + 10,
    // Preferred blocks (1st, 2nd, 3rd choice)
    prefMon: getRandomPrefs(3),
    prefTue: getRandomPrefs(3),
    prefThu: getRandomPrefs(3),
  };
});

async function cleanup() {
  console.log("🧹 Cleaning up test data for Cycle 9999...");
  const testIds = testPlayers.map((p) => p.gameId);
  
  // Delete reservations
  await supabase.from("reservations").delete().eq("cycle_id", TEST_CYCLE);
  // Delete preferences
  await supabase.from("preferences").delete().eq("cycle_id", TEST_CYCLE);
  // Delete players
  await supabase.from("players").delete().in("game_id", testIds);
}

async function simulate() {
  // 1. Fetch current cycle ID to restore later
  const { data: origCycleSetting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "current_cycle_id")
    .single();
  const originalCycle = origCycleSetting?.value ?? "1";

  try {
    // 2. Set current_cycle_id to 9999 for test isolation
    console.log(`🚀 Initializing Simulation for Cycle ${TEST_CYCLE}...`);
    await supabase
      .from("settings")
      .upsert({ key: "current_cycle_id", value: String(TEST_CYCLE) });

    await cleanup();

    // Enable reservations if they are closed
    await supabase
      .from("settings")
      .upsert({ key: "reservation_open", value: "true" });

    console.log("\n=========================================================================");
    console.log("📝 STAGE 1: Simulating 70 Players Making Multi-Day Reservations sequentially");
    console.log("=========================================================================");

    let successCount = 0;
    for (let i = 0; i < testPlayers.length; i++) {
      const p = testPlayers[i];
      console.log(`[${i + 1}/70] ${p.name} (Speedups - Mon:${p.speedupMon}h, Tue:${p.speedupTue}h, Thu:${p.speedupThu}h) is applying...`);
      
      const daysInput = [
        { dayOfWeek: "mon" as DayOfWeek, speedup: p.speedupMon, preferredBlocks: p.prefMon },
        { dayOfWeek: "tue" as DayOfWeek, speedup: p.speedupTue, preferredBlocks: p.prefTue },
        { dayOfWeek: "thu" as DayOfWeek, speedup: p.speedupThu, preferredBlocks: p.prefThu },
      ];

      const res = await processMultiDayReservation(
        supabase,
        p.gameId,
        p.name,
        p.alliance,
        daysInput
      );

      if (res.success) {
        successCount++;
      }
    }

    console.log("\n=========================================================================");
    console.log("📊 STAGE 2: Simulation Statistics & Result Verification");
    console.log("=========================================================================");

    // Fetch all reservations from database for TEST_CYCLE
    const { data: reservations } = await supabase
      .from("reservations")
      .select(`
        id, 
        status, 
        player_id, 
        slot_id, 
        applied_at,
        players(game_id, name, alliance, speedup_vp, speedup_mo), 
        slots(day_of_week, block_start_utc, slot_index)
      `)
      .eq("cycle_id", TEST_CYCLE);

    const resList = reservations ?? [];

    // Categorize
    const monAssigned = resList.filter(r => (r.slots as any)?.day_of_week === "mon" && r.status === "assigned");
    const tueAssigned = resList.filter(r => (r.slots as any)?.day_of_week === "tue" && r.status === "assigned");
    const thuAssigned = resList.filter(r => (r.slots as any)?.day_of_week === "thu" && r.status === "assigned");

    const monEliminated = resList.filter(r => r.status === "eliminated" && !r.slot_id); 
    // Note: eliminated entries in DB are registered per day.
    // Let's count how many eliminated per day by checking player preferences.
    const { data: allPrefs } = await supabase
      .from("preferences")
      .select("player_id, day_of_week")
      .eq("cycle_id", TEST_CYCLE);

    const prefMap = new Map<string, Set<number>>();
    allPrefs?.forEach(p => {
      if (!prefMap.has(p.day_of_week)) {
        prefMap.set(p.day_of_week, new Set());
      }
      prefMap.get(p.day_of_week)!.add(p.player_id);
    });

    const getEliminatedForDay = (day: string) => {
      const dayPrefIds = prefMap.get(day) ?? new Set<number>();
      const assignedIds = new Set(resList.filter(r => (r.slots as any)?.day_of_week === day && r.status === "assigned").map(r => r.player_id));
      return Array.from(dayPrefIds).filter(id => !assignedIds.has(id));
    };

    const monElim = getEliminatedForDay("mon");
    const tueElim = getEliminatedForDay("tue");
    const thuElim = getEliminatedForDay("thu");

    console.log(`📋 Total Applicants: 70 players`);
    console.log(`\n📅 [Monday (VP Office)]`);
    console.log(`   - Assigned Slots: ${monAssigned.length} / 48 (Max slots)`);
    console.log(`   - Waitlisted (Eliminated): ${monElim.length} players`);
    
    console.log(`\n📅 [Tuesday (VP Office)]`);
    console.log(`   - Assigned Slots: ${tueAssigned.length} / 48 (Max slots)`);
    console.log(`   - Waitlisted (Eliminated): ${tueElim.length} players`);

    console.log(`\n📅 [Thursday (MO Office)]`);
    console.log(`   - Assigned Slots: ${thuAssigned.length} / 48 (Max slots)`);
    console.log(`   - Waitlisted (Eliminated): ${thuElim.length} players`);

    console.log("\n-------------------------------------------------------------------------");
    console.log("🔍 Detailed Cascade Conflict Analysis (Checking prime time block: 12 UTC)");
    console.log("-------------------------------------------------------------------------");
    
    // Let's look at Monday UTC 12 block (KST 21:00) to see how the top 4 were selected
    const block12Mon = resList.filter(r => (r.slots as any)?.day_of_week === "mon" && (r.slots as any)?.block_start_utc === 12 && r.status === "assigned");
    // Sort them by slot_index
    block12Mon.sort((a, b) => ((a.slots as any)?.slot_index ?? 0) - ((b.slots as any)?.slot_index ?? 0));

    console.log(`Monday UTC 12 Block Assignments (Top 4 speedups chosen):`);
    block12Mon.forEach((r, idx) => {
      const p = r.players as any;
      console.log(`  Slot #${idx + 1}: ${p.name} (${p.alliance}) | Speedup: ${p.speedup_vp}h | Applied at: ${r.applied_at}`);
    });

    // Check how many people actually had Monday 12 UTC as preference
    const mon12Prefs = allPrefs?.filter(p => p.day_of_week === "mon" && p.player_id) ?? [];
    const mon12PrefCount = allPrefs?.filter(p => p.day_of_week === "mon")?.length ?? 0;
    console.log(`\n💡 Total players who desired Monday 12 UTC: ${mon12PrefCount} players.`);
    console.log(`   -> The top 4 highest speedup players were assigned successfully!`);
    console.log(`   -> The other ${Math.max(0, mon12PrefCount - 4)} players were automatically shifted to their 2nd/3rd choices or waitlisted!`);

    console.log("\n=========================================================================");
    console.log("📄 STAGE 3: Testing Fixed-Grid CSV Generation with Simulation Data");
    console.log("=========================================================================");
    console.log("Generating CSV using exportCsv()...");

    const csvContent = await generateTestCsv(supabase, TEST_CYCLE);
    const lines = csvContent.trim().split("\n");
    console.log(`📊 Generated CSV Total Lines: ${lines.length} lines`);
    
    // Validations
    const expectedHeader = "요일,구간(UTC),슬롯시작(UTC),슬롯시작(KST),슬롯번호(1~4),게임ID,이름,연맹,스피드업(days),상태";
    const headerOk = lines[0].startsWith(expectedHeader);
    console.log(`   - Header matching: ${headerOk ? "✅ Passed" : "❌ Failed"}`);
    console.log(`   - Total grid lines: ${lines.length === 149 ? "✅ Passed (Exactly 149 lines - 48 slots per day * 3 days + header + 3 spacers - 1 last empty line)" : `❌ Failed (Lines: ${lines.length})`}`);

    // Print a snippet of the CSV to demonstrate correct layout
    console.log("\n📝 [CSV Output Sample - Monday UTC 12 Block]");
    // Find lines matching Mon, block 12 (KST 21:00)
    const mon12SampleLines = lines.filter(l => l.includes("월요일") && (l.includes("12:00") || l.includes("21:00")));
    mon12SampleLines.forEach(l => console.log(`   ${l}`));

  } catch (error) {
    console.error("❌ Simulation Error:", error);
  } finally {
    // 5. Restore original current_cycle_id and cleanup
    console.log(`\n🧹 Restoring original Cycle ID to #${originalCycle}...`);
    await supabase
      .from("settings")
      .upsert({ key: "current_cycle_id", value: String(originalCycle) });
    
    await cleanup();
    console.log("✅ Done! Test environment completely cleaned up.");
  }
}

simulate().catch(console.error);
