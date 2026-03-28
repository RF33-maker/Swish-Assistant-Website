// client/src/lib/supabase.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || 'https://omkwqpcgttrgvbhcxgqf.supabase.co';
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ta3dxcGNndHRyZ3ZiaGN4Z3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY1MjQ5NDAsImV4cCI6MjA2MjEwMDk0MH0.m58UtfRt6uCpnaeLYEERlrpReF2B1sHy1ztCadL44CA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface TestSchemaConfig {
  schema: string;
  dataLeagueId: string;
}

const TEST_SCHEMA_LEAGUES: Record<string, TestSchemaConfig> = {
  "uwe-summer-league-d1-2025": { schema: "test", dataLeagueId: "58d633d5-58e6-4aca-8532-d87d424119c5" },
  "feb33bc0-c928-4407-bc99-d28c7e6ee059": { schema: "test", dataLeagueId: "58d633d5-58e6-4aca-8532-d87d424119c5" },
};

const schemaClients: Record<string, SupabaseClient> = {};

function getSchemaClient(schema: string): SupabaseClient {
  if (schema === "public") return supabase;
  if (!schemaClients[schema]) {
    schemaClients[schema] = createClient(supabaseUrl, supabaseAnonKey, {
      db: { schema },
    });
  }
  return schemaClients[schema];
}

export function getSupabaseForLeague(leagueSlugOrId: string | undefined | null): SupabaseClient {
  if (!leagueSlugOrId) return supabase;
  const config = TEST_SCHEMA_LEAGUES[leagueSlugOrId];
  return config ? getSchemaClient(config.schema) : supabase;
}

export function getDataLeagueId(leagueSlugOrId: string | undefined | null, originalLeagueId: string): string {
  if (!leagueSlugOrId) return originalLeagueId;
  const config = TEST_SCHEMA_LEAGUES[leagueSlugOrId];
  return config ? config.dataLeagueId : originalLeagueId;
}

export function isTestSchemaLeague(leagueSlugOrId: string | undefined | null): boolean {
  if (!leagueSlugOrId) return false;
  return !!TEST_SCHEMA_LEAGUES[leagueSlugOrId];
}

// API utilities for Flask backend (proxied through Express)
export const backendApi = {
  // Upload and parse file
  async uploadFile(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'File upload failed');
    }

    return response.json();
  },

  // Send chat message
  async sendMessage(message: string, context?: any): Promise<any> {
    const response = await fetch(`/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, context }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Chat request failed');
    }

    return response.json();
  },

  // Parse document
  async parseDocument(documentId: string): Promise<any> {
    const response = await fetch(`/parse/${documentId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Document parsing failed');
    }

    return response.json();
  },
};
