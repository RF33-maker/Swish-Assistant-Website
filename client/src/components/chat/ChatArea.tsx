import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import MessageBubble from './MessageBubble';
import ModeToggle from './ModeToggle';

interface Message {
  sender: 'user' | 'assistant';
  text: string;
}

interface ChatAreaProps {
  externalMode?: string;
  onScoutingResponse?: (text: string) => void;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

const ChatArea: React.FC<ChatAreaProps> = ({ externalMode, onScoutingResponse }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState(externalMode ?? 'general');
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [pendingSummaryId, setPendingSummaryId] = useState<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (externalMode) setMode(externalMode);
  }, [externalMode]);

  useEffect(() => {
    const initThread = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/start`);
        setThreadId(res.data.thread_id);
      } catch (err) {
        console.error("❌ Failed to start new thread:", err);
      }
    };
    initThread();
  }, []);

  // 🧠 Extract player name from user message
  const extractName = (text: string): string | null => {
    const match = text.match(/(?:how did|what did)?\s*([A-Z][a-z]+ [A-Z][a-z]+)/i);
    return match ? match[1].trim() : null;
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const playerName = extractName(input);
    const userMessage: Message = { sender: 'user', text: input };
    setMessages((prev) => [...prev, userMessage]);

    try {
      setLoading(true);
      if (!threadId) throw new Error("No thread ID available");

      const res = await axios.post(`${BACKEND_URL}/chat`, {
        thread_id: threadId,
        message: input,
        player_name: playerName,
        chatMode: mode
      });

      setMessages((prev) => [
        ...prev,
        { sender: 'assistant', text: res.data.response },      // 📊 Raw stats
        { sender: 'assistant', text: res.data.gpt_summary }    // 🧠 Summary
      ]);

      if (mode === 'scouting' && onScoutingResponse) {
        onScoutingResponse(res.data.gpt_summary);
      }
    } catch (error: any) {
      console.error("❌ Error in assistant pipeline:", error);
      console.error("🛑 Backend response:", error.response?.data);
      const errMsg = error.response?.data?.error || 'Error: Could not reach assistant backend.';
      setMessages((prev) => [
        ...prev,
        { sender: 'assistant', text: errMsg }
      ]);
    } finally {
      setLoading(false);
      setInput('');
    }
  };
  
  return (
    <div className="flex flex-col h-[80vh] w-full max-w-3xl mx-auto border rounded-2xl p-4 bg-white shadow-xl">
      {!externalMode && <ModeToggle mode={mode} setMode={setMode} />}
      <div className="flex-1 overflow-y-auto px-2">
        {messages.map((msg, idx) => (
          <MessageBubble key={idx} message={msg.text} sender={msg.sender} />
        ))}
        {loading && <MessageBubble message="Typing..." sender="assistant" />}
        <div ref={bottomRef} />
      </div>
      <div className="flex mt-2">
        <input
          type="text"
          placeholder="Type your message..."
          className="flex-1 border rounded-l-lg px-4 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-r-lg"
          onClick={sendMessage}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatArea;
