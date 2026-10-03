// Prints the commentary feed for a finished game, to read and tune the wording.
//   npx tsx scripts/commentary-sample.ts <game_key> [minImportance]
import { readFileSync } from "node:fs";
import { buildCommentary, type CommentaryEvent, type CommentaryShot } from "../client/src/lib/liveCommentary";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
const get = async (path: string) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
};

const gameKey = process.argv[2];
const min = Number(process.argv[3] ?? 40);
const [events, shots, sched] = await Promise.all([
  get(`live_events?game_key=eq.${gameKey}&select=*&order=action_number.asc&limit=2000`) as Promise<(CommentaryEvent & { league_id: string })[]>,
  get(`shot_chart?game_key=eq.${gameKey}&select=action_number,x,y,success&limit=1000`) as Promise<CommentaryShot[]>,
  get(`game_schedule?game_key=eq.${gameKey}&select=hometeam,awayteam,status`),
]);
const ids = [...new Set(events.map((e) => e.player_id).filter(Boolean))] as string[];
const players = ids.length ? await get(`players?id=in.(${ids.join(",")})&select=id,full_name`) : [];
const playerNames = Object.fromEntries(players.map((p: any) => [p.id, p.full_name]));

const items = buildCommentary({
  events, shots, playerNames,
  homeTeam: sched[0].hometeam, awayTeam: sched[0].awayteam,
  isFinal: String(sched[0].status).toLowerCase() === "final",
});
console.log(`${sched[0].awayteam} @ ${sched[0].hometeam} — ${items.length} moments, showing importance >= ${min}\n`);
for (const i of items.filter((x) => x.importance >= min)) {
  console.log(`${`Q${i.period}`.padEnd(3)} ${(i.clock ?? "").slice(0, 5).padEnd(5)} [${String(i.importance).padStart(3)}] ${i.emoji} ${i.text}   (${i.awayScore}-${i.homeScore})`);
}
