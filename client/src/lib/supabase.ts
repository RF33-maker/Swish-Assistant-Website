// client/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://omkwqpcgttrgvbhcxgqf.supabase.co', // Replace with your real Supabase URL
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ta3dxcGNndHRyZ3ZiaGN4Z3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY1MjQ5NDAsImV4cCI6MjA2MjEwMDk0MH0.m58UtfRt6uCpnaeLYEERlrpReF2B1sHy1ztCadL44CA'                 // Replace with your anon/public key
);
