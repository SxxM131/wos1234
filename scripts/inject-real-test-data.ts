import { createClient } from "@supabase/supabase-js";
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

const ALLIANCES = ["WOS", "LEO", "MOON", "SUN", "ZEUS"];
const TIME_BLOCKS = Array.from({ length: 12 }, (_, i) => i * 2);

function getRandomPrefs(count: number): number[] {
  const primeTime = [10, 12, 14, 16];
  const pool = [...TIME_BLOCKS];
  const prefs: number[] = [];
  
  while (prefs.length < count) {
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

// Generate 70 randomized players with prefixed names
const testPlayers = Array.from({ length: 70 }, (_, i) => {
  const id = 300001 + i;
  return {
    gameId: id,
    name: `테스터_${String(i + 1).padStart(2, "0")}`,
    alliance: ALLIANCES[Math.floor(Math.random() * ALLIANCES.length)],
    speedupMon: Math.floor(Math.random() * 49) * 10 + 10,
    speedupTue: Math.floor(Math.random() * 49) * 10 + 10,
    speedupThu: Math.floor(Math.random() * 49) * 10 + 10,
    prefMon: getRandomPrefs(3),
    prefTue: getRandomPrefs(3),
    prefThu: getRandomPrefs(3),
  };
});

async function runInjection() {
  const currentCycle = await getCurrentCycleId(supabase);
  console.log(`🚨 WARNING: Preparing to inject 70 randomized test players directly into Active Cycle #${currentCycle}!`);
  console.log("This will leave the test data inside your real database for live testing on your website.\n");

  // Make sure reservations are open
  await supabase
    .from("settings")
    .upsert({ key: "reservation_open", value: "true" });

  console.log("⏳ Starting sequential reservation submissions...");

  for (let i = 0; i < testPlayers.length; i++) {
    const p = testPlayers[i];
    console.log(`[${i + 1}/70] Injecting ${p.name} into Cycle #${currentCycle}...`);

    const daysInput = [
      { dayOfWeek: "mon" as DayOfWeek, speedup: p.speedupMon, preferredBlocks: p.prefMon },
      { dayOfWeek: "tue" as DayOfWeek, speedup: p.speedupTue, preferredBlocks: p.prefTue },
      { dayOfWeek: "thu" as DayOfWeek, speedup: p.speedupThu, preferredBlocks: p.prefThu },
    ];

    await processMultiDayReservation(
      supabase,
      p.gameId,
      p.name,
      p.alliance,
      daysInput
    );
  }

  console.log("\n=========================================================");
  console.log("🎉 SUCCESS: 70 players have been injected!");
  console.log(`Open your browser and visit: https://wos1234.vercel.app/status`);
  console.log("Log in to /admin with your configured admin password to check or download the CSV.");
  console.log("\n💡 TO CLEAN UP LATER:");
  console.log("You can easily clear this data by logging in to the admin panel");
  console.log("and typing 'RESET' in the 'Reset cycle' section!");
  console.log("=========================================================");
}

runInjection().catch(console.error);
