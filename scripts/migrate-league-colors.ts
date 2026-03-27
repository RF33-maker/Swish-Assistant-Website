import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials (VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkColumnsExist(): Promise<boolean> {
  const { error } = await supabase
    .from('leagues')
    .select('primary_color')
    .limit(1);

  if (error && error.message.includes('primary_color')) {
    return false;
  }
  return true;
}

async function migrate() {
  const columnsExist = await checkColumnsExist();

  if (columnsExist) {
    console.log('Migration 001_add_league_colors: columns already exist. No action needed.');
    return;
  }

  const sqlPath = path.resolve(__dirname, '..', 'migrations', '001_add_league_colors.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  console.log('Migration 001_add_league_colors: columns do not exist yet.');
  console.log('Run the following SQL in your Supabase SQL Editor:');
  console.log('');
  console.log(sql);
  console.log('Migration file: migrations/001_add_league_colors.sql');
  process.exit(1);
}

migrate().catch(console.error);
