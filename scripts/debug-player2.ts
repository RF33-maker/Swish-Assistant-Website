import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function debugPlayer() {
  // Check if the player_id from stats exists in players table
  const playerId = 'b35237bb-3539-4749-8ad2-1eb55eb06e05';
  
  console.log(`\n🔍 Looking up player ID: ${playerId}`);
  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single();
  
  console.log('Result:', player);
  
  // Also search by name "Michael Hood"
  console.log(`\n🔍 Searching for "Michael Hood" in players table...`);
  const { data: byName } = await supabase
    .from('players')
    .select('id, full_name, slug, league_id')
    .ilike('full_name', '%Michael Hood%');
  
  console.log('By name:', byName);
}

debugPlayer().catch(console.error);
