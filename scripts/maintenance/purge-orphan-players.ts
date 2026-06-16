#!/usr/bin/env npx tsx
/** Remove players with no preferences in any cycle. Run after an incomplete reset. */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(resolve(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: players } = await supabase.from("players").select("player_id");
  let removed = 0;

  for (const p of players ?? []) {
    const { count } = await supabase
      .from("preferences")
      .select("*", { count: "exact", head: true })
      .eq("player_id", p.player_id);

    if (!count) {
      await supabase.from("players").delete().eq("player_id", p.player_id);
      removed++;
      console.log(`Removed orphan player ${p.player_id}`);
    }
  }

  console.log(`Done. Removed ${removed} orphan player(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
