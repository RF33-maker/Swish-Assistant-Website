/**
 * merge-duplicate-players.ts
 *
 * Scans the `players` table for records whose names are fuzzy-matched as the
 * same person (typos, mis-spellings, etc.), then optionally merges them by
 * re-pointing all `player_stats` rows to the canonical player_id and deleting
 * the stale player record.
 *
 * Usage:
 *   npx tsx scripts/merge-duplicate-players.ts [options]
 *
 * Options:
 *   --dry-run              Print proposed merges without touching the DB (default).
 *   --execute              Perform the merges. Shows dry-run summary first and
 *                          prompts for confirmation unless --yes is also passed.
 *   --yes                  Skip confirmation prompt when used with --execute.
 *   --league-slug <slug>   Scope the scan to a single league (e.g. reba-sl).
 *   --manual <path>        Path to a JSON file of manual merge overrides.
 *                          Default: scripts/manual-merges.json (if it exists).
 *
 * Manual merges JSON format:
 *   [
 *     { "keepId": "<uuid>", "mergeId": "<uuid>" },   // force merge
 *     { "keepId": "<uuid>", "mergeId": "<uuid>", "skip": true }  // prevent auto-merge
 *   ]
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials.');
  console.error('Required: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ---------------------------------------------------------------------------
// CLI flag parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isDryRun = !args.includes('--execute');
const skipConfirm = args.includes('--yes');

const leagueSlugIdx = args.indexOf('--league-slug');
const leagueSlugFilter = leagueSlugIdx !== -1 ? args[leagueSlugIdx + 1] : null;

const manualIdx = args.indexOf('--manual');
const manualPath =
  manualIdx !== -1
    ? args[manualIdx + 1]
    : path.join(path.dirname(new URL(import.meta.url).pathname), 'manual-merges.json');

// ---------------------------------------------------------------------------
// Manual overrides
// ---------------------------------------------------------------------------

interface ManualOverride {
  keepId: string;
  mergeId: string;
  skip?: boolean;
}

function loadManualOverrides(filePath: string): ManualOverride[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(`⚠️  manual-merges.json is not an array — ignoring`);
      return [];
    }
    return parsed as ManualOverride[];
  } catch (e) {
    console.warn(`⚠️  Failed to parse ${filePath}:`, e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Fuzzy matching (ported from client/src/lib/fuzzyMatch.ts)
// ---------------------------------------------------------------------------

const NICKNAME_MAP: Record<string, string[]> = {
  chuck: ['chukwuma', 'charles'],
  chukwuma: ['chuck'],
  charles: ['chuck', 'charlie'],
  charlie: ['charles'],
  mike: ['michael'],
  michael: ['mike'],
  chris: ['christopher'],
  christopher: ['chris'],
  nick: ['nicholas', 'nicolas'],
  nicholas: ['nick'],
  nicolas: ['nick'],
  will: ['william', 'wilfrid'],
  william: ['will', 'bill', 'billy'],
  wilfrid: ['will'],
  bill: ['william'],
  billy: ['william', 'bill'],
  alex: ['alexander', 'alejandro'],
  alexander: ['alex'],
  alejandro: ['alex'],
  dan: ['daniel'],
  daniel: ['dan', 'danny'],
  danny: ['daniel'],
  joe: ['joseph', 'jose'],
  joseph: ['joe', 'joey'],
  jose: ['joe'],
  joey: ['joseph'],
  matt: ['matthew', 'mathew'],
  matthew: ['matt'],
  mathew: ['matt'],
  ben: ['benjamin'],
  benjamin: ['ben', 'benny'],
  benny: ['benjamin'],
  rob: ['robert', 'roberto'],
  robert: ['rob', 'bob', 'bobby'],
  roberto: ['rob'],
  bob: ['robert'],
  bobby: ['robert', 'bob'],
  ed: ['edward', 'eduardo'],
  edward: ['ed', 'eddie'],
  eduardo: ['ed'],
  eddie: ['edward'],
  tom: ['thomas', 'tommy'],
  thomas: ['tom', 'tommy'],
  tommy: ['thomas', 'tom'],
  jim: ['james', 'jimmy'],
  james: ['jim', 'jimmy', 'jamie'],
  jimmy: ['james', 'jim'],
  jamie: ['james'],
  dave: ['david'],
  david: ['dave'],
  steve: ['steven', 'stephen'],
  steven: ['steve'],
  stephen: ['steve'],
  tony: ['anthony', 'antonio'],
  anthony: ['tony'],
  antonio: ['tony'],
  sam: ['samuel', 'sammy'],
  samuel: ['sam', 'sammy'],
  sammy: ['sam', 'samuel'],
  max: ['maxwell', 'maximilian'],
  maxwell: ['max'],
  maximilian: ['max'],
  josh: ['joshua'],
  joshua: ['josh'],
  jack: ['jackson', 'john'],
  jackson: ['jack'],
  john: ['jack', 'johnny', 'jon'],
  johnny: ['john'],
  jon: ['john', 'jonathan'],
  jonathan: ['jon'],
  pete: ['peter'],
  peter: ['pete'],
  andy: ['andrew', 'andre'],
  andrew: ['andy', 'drew'],
  andre: ['andy'],
  drew: ['andrew'],
  zach: ['zachary', 'zachariah', 'zakariah'],
  zachary: ['zach'],
  zachariah: ['zach'],
  zakariah: ['zach'],
};

function areNicknameVariants(a: string, b: string): boolean {
  const n1 = a.toLowerCase().trim();
  const n2 = b.toLowerCase().trim();
  if (n1 === n2) return true;
  return (NICKNAME_MAP[n1] || []).includes(n2) || (NICKNAME_MAP[n2] || []).includes(n1);
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z\s]/g, '');
}

function jaroWinkler(s1: string, s2: string): number {
  const l1 = s1.length;
  const l2 = s2.length;
  if (l1 === 0 && l2 === 0) return 1;
  if (l1 === 0 || l2 === 0) return 0;

  const window = Math.max(0, Math.floor(Math.max(l1, l2) / 2) - 1);
  const m1 = new Array(l1).fill(false);
  const m2 = new Array(l2).fill(false);
  let matches = 0;

  for (let i = 0; i < l1; i++) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, l2);
    for (let j = start; j < end; j++) {
      if (m2[j] || s1[i] !== s2[j]) continue;
      m1[i] = true;
      m2[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let t = 0;
  let k = 0;
  for (let i = 0; i < l1; i++) {
    if (!m1[i]) continue;
    while (!m2[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }

  const jaro = (matches / l1 + matches / l2 + (matches - t / 2) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, l1, l2); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

function namesMatch(name1: string, name2: string, threshold = 0.85): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  if (n1 === n2) return true;

  const p1 = n1.split(' ').filter(Boolean);
  const p2 = n2.split(' ').filter(Boolean);

  // Single-word vs multi-word last-name match
  if (p1.length === 1 && p2.length >= 2) {
    if (jaroWinkler(p1[0], p2[p2.length - 1]) >= 0.9) return true;
  }
  if (p2.length === 1 && p1.length >= 2) {
    if (jaroWinkler(p2[0], p1[p1.length - 1]) >= 0.9) return true;
  }

  // Same part count
  if (p1.length === p2.length) {
    let allMatch = true;
    for (let i = 0; i < p1.length; i++) {
      const a = p1[i];
      const b = p2[i];
      if (
        a !== b &&
        !(a.length === 1 && b.startsWith(a)) &&
        !(b.length === 1 && a.startsWith(b)) &&
        !areNicknameVariants(a, b)
      ) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return true;
  }

  // Different part counts — last name + first initial/nickname
  if (p1.length !== p2.length && p1.length >= 1 && p2.length >= 1) {
    const shorter = p1.length < p2.length ? p1 : p2;
    const longer = p1.length < p2.length ? p2 : p1;
    const sLast = shorter[shorter.length - 1];
    const lLast = longer[longer.length - 1];
    if (jaroWinkler(sLast, lLast) >= 0.85) {
      const sf = shorter[0];
      const lf = longer[0];
      if ((sf.length === 1 && lf.startsWith(sf)) || (lf.length === 1 && sf.startsWith(lf))) return true;
      if (areNicknameVariants(sf, lf)) return true;
      if (jaroWinkler(sf, lf) >= 0.8) return true;
    }
  }

  // Same part count with typo tolerance
  if (p1.length === p2.length && p1.length >= 2) {
    const last1 = p1[p1.length - 1];
    const last2 = p2[p2.length - 1];
    const first1 = p1[0];
    const first2 = p2[0];
    const firstMatch =
      first1 === first2 ||
      (first1.length === 1 && first2.startsWith(first1)) ||
      (first2.length === 1 && first1.startsWith(first2)) ||
      areNicknameVariants(first1, first2) ||
      jaroWinkler(first1, first2) >= 0.9;
    if (firstMatch && jaroWinkler(last1, last2) >= 0.85) return true;
  }

  // Single-word fuzzy
  if (p1.length <= 1 && p2.length <= 1) {
    return jaroWinkler(n1, n2) >= threshold;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface PlayerRow {
  id: string;
  full_name: string;
  name: string;
  league_id: string;
  slug?: string;
  statsCount?: number;
}

interface MergePair {
  canonicalId: string;
  canonicalName: string;
  canonicalSlug?: string;
  duplicateId: string;
  duplicateName: string;
  duplicateSlug?: string;
  leagueId: string;
  leagueSlug?: string;
  statsToRepoint: number;
  source: 'auto' | 'manual';
}

// ---------------------------------------------------------------------------
// Main logic
// ---------------------------------------------------------------------------

async function fetchLeagueSlugMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await supabase.from('leagues').select('league_id, slug');
  for (const row of data || []) {
    map.set(row.league_id, row.slug);
  }
  return map;
}

async function fetchPlayers(leagueId?: string): Promise<PlayerRow[]> {
  let query = supabase
    .from('players')
    .select('id, full_name, name, league_id, slug')
    .order('league_id');

  if (leagueId) {
    query = query.eq('league_id', leagueId);
  }

  const PAGE = 1000;
  const rows: PlayerRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await query.range(offset, offset + PAGE - 1);
    if (error) {
      console.error('Error fetching players:', error);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as PlayerRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return rows;
}

async function fetchStatsCounts(playerIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const CHUNK = 200;

  for (let i = 0; i < playerIds.length; i += CHUNK) {
    const chunk = playerIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('player_stats')
      .select('player_id')
      .in('player_id', chunk);

    if (error) {
      console.error('Error fetching stats counts:', error);
      continue;
    }

    for (const row of data || []) {
      map.set(row.player_id, (map.get(row.player_id) || 0) + 1);
    }
  }

  return map;
}

function detectDuplicates(
  players: PlayerRow[],
  statsCounts: Map<string, number>,
  skipPairs: Set<string>
): MergePair[] {
  // Group by league
  const byLeague = new Map<string, PlayerRow[]>();
  for (const p of players) {
    if (!byLeague.has(p.league_id)) byLeague.set(p.league_id, []);
    byLeague.get(p.league_id)!.push(p);
  }

  const pairs: MergePair[] = [];
  const mergedIds = new Set<string>(); // track IDs already consumed as duplicates

  for (const [leagueId, group] of byLeague) {
    for (let i = 0; i < group.length; i++) {
      const a = group[i];
      if (mergedIds.has(a.id)) continue;

      for (let j = i + 1; j < group.length; j++) {
        const b = group[j];
        if (mergedIds.has(b.id)) continue;

        const pairKey = [a.id, b.id].sort().join('|');
        if (skipPairs.has(pairKey)) continue;

        const aName = a.full_name || a.name || '';
        const bName = b.full_name || b.name || '';

        if (!aName || !bName) continue;
        if (!namesMatch(aName, bName)) continue;

        // Choose canonical player explicitly:
        //  1. More full words (words with length > 1) wins — prefers complete names over initials
        //  2. Tie: more player_stats rows wins — keeps the record most data references
        //  3. Tie: longer full_name string wins — deterministic final fallback
        const aFullWords = aName.split(' ').filter(p => p.length > 1).length;
        const bFullWords = bName.split(' ').filter(p => p.length > 1).length;
        const aStats = statsCounts.get(a.id) || 0;
        const bStats = statsCounts.get(b.id) || 0;

        let aIsCanonical: boolean;
        if (aFullWords !== bFullWords) {
          aIsCanonical = aFullWords > bFullWords;
        } else if (aStats !== bStats) {
          aIsCanonical = aStats > bStats;
        } else {
          aIsCanonical = aName.length >= bName.length;
        }

        const canonical = aIsCanonical ? a : b;
        const duplicate = aIsCanonical ? b : a;

        mergedIds.add(duplicate.id);

        pairs.push({
          canonicalId: canonical.id,
          canonicalName: canonical.full_name || canonical.name || '',
          canonicalSlug: canonical.slug,
          duplicateId: duplicate.id,
          duplicateName: duplicate.full_name || duplicate.name || '',
          duplicateSlug: duplicate.slug,
          leagueId,
          statsToRepoint: statsCounts.get(duplicate.id) || 0,
          source: 'auto',
        });
      }
    }
  }

  return pairs;
}

async function buildMergePairs(
  players: PlayerRow[],
  statsCounts: Map<string, number>,
  manualOverrides: ManualOverride[],
  leagueSlugMap: Map<string, string>
): Promise<MergePair[]> {
  // Build skip set from manual overrides with skip: true
  const skipPairs = new Set<string>();
  for (const o of manualOverrides) {
    if (o.skip) {
      skipPairs.add([o.keepId, o.mergeId].sort().join('|'));
    }
  }

  const autoPairs = detectDuplicates(players, statsCounts, skipPairs);

  // Attach league slugs
  for (const p of autoPairs) {
    p.leagueSlug = leagueSlugMap.get(p.leagueId);
  }

  // Add manual (non-skip) overrides
  const playerMap = new Map(players.map(p => [p.id, p]));
  const manualPairs: MergePair[] = [];

  for (const o of manualOverrides) {
    if (o.skip) continue;
    const keep = playerMap.get(o.keepId);
    const merge = playerMap.get(o.mergeId);
    if (!keep || !merge) {
      console.warn(`⚠️  Manual override skipped — could not find players: keepId=${o.keepId} mergeId=${o.mergeId}`);
      continue;
    }
    // Remove any auto pair that covers the same duplicate
    const autoIdx = autoPairs.findIndex(
      p => p.duplicateId === o.mergeId || p.canonicalId === o.mergeId
    );
    if (autoIdx !== -1) autoPairs.splice(autoIdx, 1);

    manualPairs.push({
      canonicalId: keep.id,
      canonicalName: keep.full_name || keep.name || '',
      canonicalSlug: keep.slug,
      duplicateId: merge.id,
      duplicateName: merge.full_name || merge.name || '',
      duplicateSlug: merge.slug,
      leagueId: keep.league_id,
      leagueSlug: leagueSlugMap.get(keep.league_id),
      statsToRepoint: statsCounts.get(merge.id) || 0,
      source: 'manual',
    });
  }

  return [...autoPairs, ...manualPairs];
}

function printDryRun(pairs: MergePair[]) {
  if (pairs.length === 0) {
    console.log('\n✅ No duplicate pairs detected.\n');
    return;
  }

  console.log(`\n${'─'.repeat(110)}`);
  console.log(
    `${'LEAGUE'.padEnd(18)} ${'KEEP (canonical)'.padEnd(32)} ${'MERGE (duplicate)'.padEnd(32)} ${'STATS'.padStart(6)}  SRC`
  );
  console.log(`${'─'.repeat(110)}`);

  for (const p of pairs) {
    const league = (p.leagueSlug || p.leagueId).slice(0, 17).padEnd(18);
    const keep = p.canonicalName.slice(0, 31).padEnd(32);
    const merge = p.duplicateName.slice(0, 31).padEnd(32);
    const stats = String(p.statsToRepoint).padStart(6);
    const src = p.source === 'manual' ? 'MAN' : 'AUTO';
    console.log(`${league} ${keep} ${merge} ${stats}  ${src}`);
  }

  console.log(`${'─'.repeat(110)}`);
  const total = pairs.reduce((s, p) => s + p.statsToRepoint, 0);
  console.log(`\n${pairs.length} pair(s) found — ${total} player_stats row(s) would be re-pointed.\n`);

  if (pairs.length > 0) {
    console.log('UUIDs for verification:');
    for (const p of pairs) {
      console.log(`  [${p.source.toUpperCase()}] keep=${p.canonicalId}  merge=${p.duplicateId}  (${p.duplicateName} → ${p.canonicalName})`);
    }
    console.log('');
  }
}

async function executeMerges(pairs: MergePair[]) {
  let mergedPairs = 0;
  let totalStatsRepointed = 0;
  let deletedPlayers = 0;
  let errors = 0;

  for (const p of pairs) {
    process.stdout.write(
      `  Merging "${p.duplicateName}" → "${p.canonicalName}" (${p.statsToRepoint} stats rows)... `
    );

    // 1. Re-point player_stats
    if (p.statsToRepoint > 0) {
      const { error: updateError } = await supabase
        .from('player_stats')
        .update({ player_id: p.canonicalId })
        .eq('player_id', p.duplicateId);

      if (updateError) {
        console.log(`❌ UPDATE failed: ${updateError.message}`);
        errors++;
        continue;
      }
      totalStatsRepointed += p.statsToRepoint;
    }

    // 2. Delete the stale player record
    const { error: deleteError } = await supabase
      .from('players')
      .delete()
      .eq('id', p.duplicateId);

    if (deleteError) {
      console.log(`⚠️  Stats re-pointed but DELETE failed: ${deleteError.message}`);
      errors++;
    } else {
      console.log('✅');
      mergedPairs++;
      deletedPlayers++;
    }
  }

  console.log('\n─────────────────────────────────');
  console.log(`Pairs merged:          ${mergedPairs}`);
  console.log(`player_stats updated:  ${totalStatsRepointed}`);
  console.log(`player records deleted:${deletedPlayers}`);
  if (errors > 0) console.log(`Errors:                ${errors}`);
  console.log('─────────────────────────────────\n');
}

async function confirm(message: string): Promise<boolean> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

async function main() {
  console.log('🏀 Merge Duplicate Players\n');
  console.log(`Mode:  ${isDryRun ? 'DRY-RUN (no changes)' : 'EXECUTE'}`);
  if (leagueSlugFilter) console.log(`Scope: league-slug = ${leagueSlugFilter}`);
  console.log('');

  // Resolve league slug filter → league_id
  let scopedLeagueId: string | undefined;
  if (leagueSlugFilter) {
    const { data: leagueRow, error } = await supabase
      .from('leagues')
      .select('league_id')
      .ilike('slug', leagueSlugFilter)
      .single();
    if (error || !leagueRow) {
      console.error(`❌ League not found for slug: ${leagueSlugFilter}`);
      process.exit(1);
    }
    scopedLeagueId = leagueRow.league_id;
  }

  // Load data
  console.log('Fetching players...');
  const players = await fetchPlayers(scopedLeagueId);
  console.log(`  Found ${players.length} player record(s).`);

  console.log('Fetching stats counts...');
  const statsCounts = await fetchStatsCounts(players.map(p => p.id));

  console.log('Fetching league slugs...');
  const leagueSlugMap = await fetchLeagueSlugMap();

  console.log('Loading manual overrides...');
  const manualOverrides = loadManualOverrides(manualPath);
  if (manualOverrides.length > 0) {
    console.log(`  Loaded ${manualOverrides.length} manual override(s) from ${manualPath}`);
  } else {
    console.log('  No manual overrides found.');
  }

  console.log('\nDetecting duplicates...');
  const pairs = await buildMergePairs(players, statsCounts, manualOverrides, leagueSlugMap);

  printDryRun(pairs);

  if (isDryRun) {
    console.log('Run with --execute to apply these merges.');
    return;
  }

  if (pairs.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  if (!skipConfirm) {
    const ok = await confirm('Proceed with merges? [y/N] ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  console.log('\nExecuting merges...\n');
  await executeMerges(pairs);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
