import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://omkwqpcgttrgvbhcxgqf.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error(
    '[supabaseServiceClient] WARNING: SUPABASE_SERVICE_ROLE_KEY is not set. ' +
    'Server-side privileged routes (uploads, admin, trending, team logos, etc.) will fail. ' +
    'Set this variable in your Vercel/deployment environment.'
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey || 'missing-key', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
