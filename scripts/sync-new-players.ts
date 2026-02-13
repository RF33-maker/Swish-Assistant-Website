import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || (!supabaseServiceKey && !supabaseAnonKey)) {
  console.error('Missing Supabase credentials');
  console.error('Required: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey!);
if (supabaseServiceKey) {
  console.log('Using service role key (bypasses RLS)');
} else {
  console.log('WARNING: Using anon key - inserts may fail due to RLS policies');
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function syncNewPlayers() {
  console.log('Syncing new players...\n');

  const { data: allPlayerIds, error: idsError } = await supabase
    .from('player_stats')
    .select('player_id')
    .not('player_id', 'is', null);

  if (idsError || !allPlayerIds) {
    console.error('Error fetching player_stats:', idsError);
    return;
  }

  const uniqueStatPlayerIds = Array.from(new Set(allPlayerIds.map(r => r.player_id)));
  console.log(`Found ${uniqueStatPlayerIds.length} unique player IDs in player_stats`);

  const { data: existingPlayers, error: playersError } = await supabase
    .from('players')
    .select('id');

  if (playersError) {
    console.error('Error fetching players:', playersError);
    return;
  }

  const existingIds = new Set((existingPlayers || []).map(p => p.id));
  const missingIds = uniqueStatPlayerIds.filter(id => !existingIds.has(id));

  console.log(`Existing players: ${existingIds.size}`);
  console.log(`Missing player profiles: ${missingIds.length}\n`);

  if (missingIds.length === 0) {
    console.log('All players have profiles!');
    return;
  }

  const newPlayers: any[] = [];
  const chunkSize = 50;

  for (let i = 0; i < missingIds.length; i += chunkSize) {
    const chunk = missingIds.slice(i, i + chunkSize);

    const { data: statsForChunk, error: statsError } = await supabase
      .from('player_stats')
      .select('player_id, firstname, familyname, full_name, team_name, league_id, team_id, shirtnumber')
      .in('player_id', chunk);

    if (statsError || !statsForChunk) {
      console.error('Error fetching stats for chunk:', statsError);
      continue;
    }

    const playerMap = new Map<string, any>();
    for (const stat of statsForChunk) {
      if (playerMap.has(stat.player_id)) continue;

      const firstName = stat.firstname || '';
      const familyName = stat.familyname || '';
      const fullName = stat.full_name || `${firstName} ${familyName}`.trim() || 'Unknown';

      playerMap.set(stat.player_id, {
        id: stat.player_id,
        full_name: fullName,
        firstname: stat.firstname || null,
        familyname: stat.familyname || null,
        team_name: stat.team_name || '',
        league_id: stat.league_id || null,
        team_id: stat.team_id || null,
        shirtNumber: stat.shirtnumber ? parseInt(stat.shirtnumber) || null : null,
      });
    }

    for (const player of playerMap.values()) {
      newPlayers.push(player);
    }
  }

  console.log(`Prepared ${newPlayers.length} new player profiles\n`);

  const slugCounts = new Map<string, number>();
  const { data: existingSlugs } = await supabase
    .from('players')
    .select('slug')
    .not('slug', 'is', null)
    .neq('slug', '');

  if (existingSlugs) {
    for (const p of existingSlugs) {
      if (p.slug) {
        const base = p.slug.replace(/-\d+$/, '');
        slugCounts.set(base, (slugCounts.get(base) || 0) + 1);
      }
    }
  }

  for (const player of newPlayers) {
    const baseSlug = generateSlug(player.full_name);
    const count = slugCounts.get(baseSlug) || 0;
    player.slug = count > 0 ? `${baseSlug}-${count}` : baseSlug;
    slugCounts.set(baseSlug, count + 1);
  }

  let successCount = 0;
  let errorCount = 0;
  const insertChunkSize = 50;

  for (let i = 0; i < newPlayers.length; i += insertChunkSize) {
    const chunk = newPlayers.slice(i, i + insertChunkSize);
    const { error: insertError } = await supabase
      .from('players')
      .upsert(chunk, { onConflict: 'id' });

    if (insertError) {
      console.error(`Error inserting chunk ${i}-${i + chunk.length}:`, insertError);
      errorCount += chunk.length;
    } else {
      successCount += chunk.length;
    }
    console.log(`  Inserted ${Math.min(i + insertChunkSize, newPlayers.length)}/${newPlayers.length}...`);
  }

  console.log('\nSync complete!');
  console.log(`Created: ${successCount}, Errors: ${errorCount}`);

  if (newPlayers.length > 0) {
    console.log('\nSample new profiles:');
    const samples = newPlayers.slice(0, 10);
    for (const p of samples) {
      console.log(`  ${p.full_name} (${p.team}) -> /player/${p.slug}`);
    }
  }
}

syncNewPlayers().catch(console.error);
