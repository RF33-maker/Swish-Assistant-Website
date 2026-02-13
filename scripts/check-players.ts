import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPlayers() {
  // Count total players
  const { count: totalCount } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true });
  
  // Count players with slugs
  const { count: withSlugs } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .not('slug', 'is', null)
    .neq('slug', '');
  
  // Count players without slugs
  const { count: withoutSlugs } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .or('slug.is.null,slug.eq.');
  
  console.log('\n📊 Player Stats:');
  console.log(`   Total players: ${totalCount}`);
  console.log(`   With slugs: ${withSlugs}`);
  console.log(`   Without slugs: ${withoutSlugs}`);
  
  // Sample 5 players with slugs
  const { data: withSlugSample } = await supabase
    .from('players')
    .select('id, full_name, slug')
    .not('slug', 'is', null)
    .neq('slug', '')
    .limit(5);
  
  console.log('\n✅ Sample players WITH slugs:');
  withSlugSample?.forEach(p => console.log(`   ${p.full_name} → ${p.slug}`));
  
  // Sample 5 players without slugs  
  const { data: withoutSlugSample } = await supabase
    .from('players')
    .select('id, full_name, slug')
    .or('slug.is.null,slug.eq.')
    .limit(5);
  
  if (withoutSlugSample && withoutSlugSample.length > 0) {
    console.log('\n❌ Sample players WITHOUT slugs:');
    withoutSlugSample?.forEach(p => console.log(`   ${p.full_name} (id: ${p.id})`));
  }
}

checkPlayers().catch(console.error);
