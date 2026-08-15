import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function debugPlayer() {
  const searchName = 'Micheal Hood';
  
  // Find player in players table
  console.log(`\n🔍 Searching for "${searchName}" in players table...`);
  const { data: players } = await supabase
    .from('players')
    .select('id, full_name, slug, league_id')
    .ilike('full_name', `%${searchName}%`);
  
  console.log('Players table results:', players);
  
  // Find their stats
  console.log(`\n🔍 Searching for "${searchName}" in player_stats table...`);
  const { data: stats } = await supabase
    .from('player_stats')
    .select('id, firstname, familyname, player_id, league_id')
    .or(`firstname.ilike.%Micheal%,familyname.ilike.%Hood%`)
    .limit(10);
  
  console.log('Player stats results:', stats);
  
  // Check if league_ids match
  if (players && players.length > 0 && stats && stats.length > 0) {
    console.log('\n📊 Comparison:');
    console.log('Players table league_id:', players[0].league_id);
    console.log('Player stats league_id:', stats[0].league_id);
    console.log('Player ID in players:', players[0].id);
    console.log('Player ID in stats:', stats[0].player_id);
  }
}

debugPlayer().catch(console.error);
