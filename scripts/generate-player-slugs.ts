import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || (!supabaseServiceKey && !supabaseAnonKey)) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Required: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey!);

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/-+/g, '-')       // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, '');  // Remove leading/trailing hyphens
}

async function populatePlayerSlugs() {
  console.log('🏀 Generating player slugs...\n');

  // Fetch all players without slugs
  const { data: players, error } = await supabase
    .from('players')
    .select('id, full_name, slug')
    .or('slug.is.null,slug.eq.');

  if (error) {
    console.error('❌ Error fetching players:', error);
    throw error;
  }

  if (!players || players.length === 0) {
    console.log('✅ All players already have slugs!');
    return;
  }

  console.log(`📊 Found ${players.length} players needing slugs\n`);

  const slugCounts = new Map<string, number>();
  const updates: { id: string; slug: string }[] = [];

  // Generate unique slugs
  for (const player of players) {
    if (!player.full_name) {
      console.warn(`⚠️  Skipping player ${player.id} - no full_name`);
      continue;
    }

    let baseSlug = generateSlug(player.full_name);
    let finalSlug = baseSlug;

    // Handle duplicates by appending number
    const count = slugCounts.get(baseSlug) || 0;
    if (count > 0) {
      finalSlug = `${baseSlug}-${count}`;
    }
    slugCounts.set(baseSlug, count + 1);

    updates.push({ id: player.id, slug: finalSlug });
  }

  console.log(`🔄 Updating ${updates.length} player slugs...\n`);

  // Update using upsert for better performance
  let successCount = 0;
  let errorCount = 0;

  // Process in chunks to avoid overwhelming the database
  const chunkSize = 100;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    
    // Use Promise.all for parallel updates within chunk
    const results = await Promise.all(
      chunk.map(update => 
        supabase
          .from('players')
          .update({ slug: update.slug })
          .eq('id', update.id)
      )
    );

    results.forEach((result, idx) => {
      if (result.error) {
        console.error(`❌ Error updating ${chunk[idx].id}:`, result.error);
        errorCount++;
      } else {
        successCount++;
      }
    });

    console.log(`   ✓ Updated ${Math.min(i + chunkSize, updates.length)}/${updates.length} players...`);
  }

  console.log('\n✅ Slug generation complete!');
  console.log(`📊 Stats: ${successCount} successful, ${errorCount} errors`);

  // Show some examples
  console.log('\n📝 Sample slugs:');
  const samples = updates.slice(0, 5);
  for (const sample of samples) {
    const player = players.find(p => p.id === sample.id);
    console.log(`   ${player?.full_name} → ${sample.slug}`);
  }
}

populatePlayerSlugs().catch(console.error);
