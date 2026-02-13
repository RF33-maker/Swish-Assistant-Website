import { useState } from "react";
import { PaperclipIcon, SendIcon, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PromptInput() {
  const [promptText, setPromptText] = useState("");
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (promptText.trim()) {
      // Here you would send the prompt to your backend
      // For now we'll just clear the input
      setPromptText("");
    }
  };
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Here you would handle the file upload
    }
  };

  return (
    <div className="mt-10 relative max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="flex overflow-hidden rounded-lg shadow-md bg-white">
        <Input
          type="text"
          className="flex-1 border-0 focus-visible:ring-0 text-base py-6"
          placeholder="Describe what you want to create..."
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
        />
        <div className="flex-shrink-0 flex items-center pr-2">
          <label className="cursor-pointer p-2 rounded-md text-neutral-500 hover:text-neutral-700 focus:outline-none">
            <PaperclipIcon className="h-5 w-5" />
            <span className="sr-only">Upload file</span>
            <input 
              type="file" 
              className="sr-only" 
              onChange={handleFileUpload}
            />
          </label>
          <Button 
            type="submit" 
            size="sm"
            className="ml-1 flex items-center"
          >
            <SendIcon className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Send</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-1"
          >
            <Mic className="h-5 w-5" />
            <span className="sr-only">Voice input</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
