import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

async function check() {
  // Find player 테스터_52
  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("name", "테스터_52")
    .single();
  console.log("=== Player 테스터_52 ===");
  console.log(player);

  if (!player) return;

  // Find preferences for this player
  const { data: prefs } = await supabase
    .from("preferences")
    .select("*")
    .eq("player_id", player.game_id);
  console.log("=== Preferences ===");
  console.log(prefs);

  // Find reservations for this player
  const { data: res } = await supabase
    .from("reservations")
    .select("*, slots(*)")
    .eq("player_id", player.game_id);
  console.log("=== Reservations ===");
  console.log(res);

  // Find slots for Thursday at block_start_utc = 4 (04:00)
  const { data: blockSlots } = await supabase
    .from("slots")
    .select("*, reservations(*)")
    .eq("day_of_week", "thu")
    .eq("block_start_utc", 4);
  console.log("=== Thursday Slots at 04:00 UTC ===");
  console.log(JSON.stringify(blockSlots, null, 2));
}

check().catch(console.error);
