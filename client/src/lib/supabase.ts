// client/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Get Supabase configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://omkwqpcgttrgvbhcxgqf.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ta3dxcGNndHRyZ3ZiaGN4Z3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY1MjQ5NDAsImV4cCI6MjA2MjEwMDk0MH0.m58UtfRt6uCpnaeLYEERlrpReF2B1sHy1ztCadL44CA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Python backend configuration - local development
const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// API utilities for Flask backend
export const backendApi = {
  // Upload and parse file
  async uploadFile(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${backendUrl}/upload`, {
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
    const response = await fetch(`${backendUrl}/chat`, {
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
    const response = await fetch(`${backendUrl}/parse/${documentId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Document parsing failed');
    }

    return response.json();
  },
};
