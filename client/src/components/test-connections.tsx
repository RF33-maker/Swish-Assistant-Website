import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase, backendApi } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

export default function TestConnections() {
  const [supabaseStatus, setSupabaseStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [backendStatus, setBackendStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const { toast } = useToast();

  const testSupabase = async () => {
    setSupabaseStatus('testing');
    try {
      const { data, error } = await supabase.from('leagues').select('id').limit(1);
      if (error) throw error;
      setSupabaseStatus('success');
      toast({
        title: "Supabase Connected",
        description: "Successfully connected to Supabase database",
      });
    } catch (error) {
      setSupabaseStatus('error');
      toast({
        title: "Supabase Connection Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const testBackend = async () => {
    setBackendStatus('testing');
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/health`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setBackendStatus('success');
      toast({
        title: "Backend Connected",
        description: "Successfully connected to Python Flask backend",
      });
    } catch (error) {
      setBackendStatus('error');
      toast({
        title: "Backend Connection Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'testing': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Supabase Connection
            <span className={getStatusColor(supabaseStatus)}>
              {supabaseStatus === 'idle' && '⚪'}
              {supabaseStatus === 'testing' && '🟡'}
              {supabaseStatus === 'success' && '🟢'}
              {supabaseStatus === 'error' && '🔴'}
            </span>
          </CardTitle>
          <CardDescription>
            Database and authentication service
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={testSupabase} 
            disabled={supabaseStatus === 'testing'}
            className="w-full"
          >
            {supabaseStatus === 'testing' ? 'Testing...' : 'Test Supabase'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Python Backend
            <span className={getStatusColor(backendStatus)}>
              {backendStatus === 'idle' && '⚪'}
              {backendStatus === 'testing' && '🟡'}
              {backendStatus === 'success' && '🟢'}
              {backendStatus === 'error' && '🔴'}
            </span>
          </CardTitle>
          <CardDescription>
            File processing and chatbot service
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={testBackend} 
            disabled={backendStatus === 'testing'}
            className="w-full"
          >
            {backendStatus === 'testing' ? 'Testing...' : 'Test Backend'}
          </Button>
        </CardContent>
      </Card>

      <div className="col-span-1 md:col-span-2 mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Environment Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <strong>Supabase URL:</strong> {import.meta.env.VITE_SUPABASE_URL || 'Not configured'}
            </div>
            <div>
              <strong>Backend URL:</strong> {import.meta.env.VITE_BACKEND_URL || 'Not configured'}
            </div>
            <div>
              <strong>Supabase Key:</strong> {import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Configured' : 'Not configured'}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}