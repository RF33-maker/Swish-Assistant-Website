// Checks the feed's running totals against each game's box score.
//   npx tsx scripts/commentary-audit.ts [gameCount]
import { readFileSync } from "node:fs";
import { buildCommentary, attachRoster, tallyMismatches, type CommentaryEvent } from "../client/src/lib/liveCommentary";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const get = async (path: string) => {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};
const want = Number(process.argv[2] ?? 40);
// Spread across the games with the shared-id problem and ordinary ones.
const keys: string[] = (await get(`game_schedule?status=eq.final&select=game_key&order=matchtime.desc&limit=${want * 3}`)).map((g: any) => g.game_key);
let games = 0, players = 0, bad = 0, claims = 0, mismatched = 0;
for (const gameKey of keys) {
  if (games >= want) break;
  const events: CommentaryEvent[] = await get(`live_events?game_key=eq.${gameKey}&select=*&order=action_number.asc&limit=3000`);
  if (events.length < 200) continue;
  const box: any[] = await get(`player_stats?game_key=eq.${gameKey}&select=player_id,full_name,firstname,familyname,side,shirtnumber,spoints,sthreepointersmade`);
  if (!box.length) continue;
  games++;
  const roster = box.map((p) => ({ playerId: p.player_id, name: p.full_name || `${p.firstname} ${p.familyname}`.trim(), shirt: p.shirtnumber, teamNo: (p.side === "2" ? 2 : 1) as 1 | 2 }));
  const evs = attachRoster(events, roster);
  const first = buildCommentary({ events: evs, homeTeam: "H", awayTeam: "A", isFinal: true });
  const boxPoints = Object.fromEntries(box.map((p) => [p.player_id, p.spoints ?? 0]));
  const off = tallyMismatches(first, boxPoints);
  mismatched += off.size;
  const items = buildCommentary({ events: evs, homeTeam: "H", awayTeam: "A", isFinal: true, suppressTallies: off });
  // Every running-total claim left in the feed must match the box score.
  for (const i of items) {
    if (!i.line || !i.playerId) continue;
    const night = i.text.match(/That's (\d+) for the night/);
    const mile = i.text.match(/(\d+) points for/); // fires on the play that crosses the mark
    if (!night && !mile) continue;
    claims++;
    const ok = night ? Number(night[1]) === i.line.pts : i.line.pts >= Number(mile![1]) && i.line.pts - Number(mile![1]) <= 2;
    if (!ok) { bad++; console.log(`WRONG ${gameKey} ${i.text} (line ${i.line.pts})`); }
  }
  void players;
}
console.log(`${games} games; ${mismatched} players had totals off from the box score and lost their tally lines; ${claims} tally claims left in the feed, ${bad} inconsistent`);
