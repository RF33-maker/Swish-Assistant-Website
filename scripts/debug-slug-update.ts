import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function debugSlugUpdate() {
  // Check Michael Hood's current state
  const { data: player } = await supabase
    .from('players')
    .select('id, full_name, slug')
    .eq('id', 'b35237bb-3539-4749-8ad2-1eb55eb06e05')
    .single();
  
  console.log('Current state:', player);
  
  // Try to update directly
  console.log('\n🔄 Attempting direct update...');
  const { data, error } = await supabase
    .from('players')
    .update({ slug: 'michael-hood' })
    .eq('id', 'b35237bb-3539-4749-8ad2-1eb55eb06e05')
    .select();
  
  if (error) {
    console.error('Update error:', error);
  } else {
    console.log('Update result:', data);
  }
  
  // Verify
  const { data: after } = await supabase
    .from('players')
    .select('id, full_name, slug')
    .eq('id', 'b35237bb-3539-4749-8ad2-1eb55eb06e05')
    .single();
  
  console.log('\nAfter update:', after);
}

debugSlugUpdate().catch(console.error);
