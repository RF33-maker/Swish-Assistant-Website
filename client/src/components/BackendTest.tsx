
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function BackendTest() {
  const [isTestingHealth, setIsTestingHealth] = useState(false);
  const [isTestingChat, setIsTestingChat] = useState(false);
  const [results, setResults] = useState<{
    health?: any;
    chat?: any;
    errors?: any;
  }>({});
  const { toast } = useToast();

  const testHealthEndpoint = async () => {
    setIsTestingHealth(true);
    try {
      console.log('Testing backend health at:', `${import.meta.env.VITE_BACKEND_URL}/health`);
      
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/health`);
      const data = await response.json();
      
      console.log('Health response:', data);
      setResults(prev => ({ ...prev, health: data }));
      
      toast({
        title: "Health Check Success",
        description: "Backend is responding to health checks",
      });
    } catch (error) {
      console.error('Health check failed:', error);
      setResults(prev => ({ ...prev, errors: { ...prev.errors, health: error } }));
      
      toast({
        title: "Health Check Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsTestingHealth(false);
    }
  };

  const testChatEndpoint = async () => {
    setIsTestingChat(true);
    try {
      console.log('Testing chat endpoint at:', `${import.meta.env.VITE_BACKEND_URL}/api/chat/league`);
      
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/chat/league`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: "Test question",
          league_id: "test-league-id",
          context: "coaching_chatbot"
        }),
      });

      const data = await response.json();
      
      console.log('Chat response:', data);
      setResults(prev => ({ ...prev, chat: data }));
      
      toast({
        title: "Chat Test Success",
        description: "Backend chat endpoint is responding",
      });
    } catch (error) {
      console.error('Chat test failed:', error);
      setResults(prev => ({ ...prev, errors: { ...prev.errors, chat: error } }));
      
      toast({
        title: "Chat Test Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsTestingChat(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Backend Integration Test</CardTitle>
          <CardDescription>
            Test the connection to your Python Flask backend
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button 
              onClick={testHealthEndpoint} 
              disabled={isTestingHealth}
              variant="outline"
            >
              {isTestingHealth ? 'Testing...' : 'Test Health Endpoint'}
            </Button>
            
            <Button 
              onClick={testChatEndpoint} 
              disabled={isTestingChat}
              variant="outline"
            >
              {isTestingChat ? 'Testing...' : 'Test Chat Endpoint'}
            </Button>
          </div>

          <div className="space-y-2 text-sm">
            <div>
              <strong>Backend URL:</strong> {import.meta.env.VITE_BACKEND_URL || 'Not configured'}
            </div>
            
            {results.health && (
              <div className="bg-green-50 p-2 rounded">
                <strong>Health Check Result:</strong> 
                <pre className="text-xs mt-1">{JSON.stringify(results.health, null, 2)}</pre>
              </div>
            )}
            
            {results.chat && (
              <div className="bg-blue-50 p-2 rounded">
                <strong>Chat Test Result:</strong> 
                <pre className="text-xs mt-1">{JSON.stringify(results.chat, null, 2)}</pre>
              </div>
            )}
            
            {results.errors && (
              <div className="bg-red-50 p-2 rounded">
                <strong>Errors:</strong> 
                <pre className="text-xs mt-1">{JSON.stringify(results.errors, null, 2)}</pre>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
