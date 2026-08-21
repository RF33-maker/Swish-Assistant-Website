import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error(
    '[supabaseServiceClient] ERROR: VITE_SUPABASE_URL is not set. ' +
    'All server-side Supabase operations will fail. ' +
    'Set this variable in your deployment environment.'
  );
}

if (!serviceRoleKey) {
  console.error(
    '[supabaseServiceClient] ERROR: SUPABASE_SERVICE_ROLE_KEY is not set. ' +
    'Server-side privileged routes (uploads, admin, trending, team logos, etc.) will fail. ' +
    'Set this variable in your deployment environment.'
  );
}

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    '[supabaseServiceClient] Missing required environment variables: ' +
    (!supabaseUrl ? 'VITE_SUPABASE_URL ' : '') +
    (!serviceRoleKey ? 'SUPABASE_SERVICE_ROLE_KEY' : '')
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
