import React, { useState } from "react";
import ChatArea from "./ChatArea";
import SwishLogo from "@/assets/Swish Assistant Logo.png";

const ChatContainer: React.FC = () => {
  const [chatMode, setChatMode] = useState("scouting");
  const [resetKey, setResetKey] = useState(0); // 👈 force remount to reset chat
  const [latestScouting, setLatestScouting] = useState<string | null>(null);

  const handleReset = () => {
    setResetKey(prev => prev + 1);
  };

  return (
    <div className="w-full max-w-6xl mx-auto flex gap-4 p-4">
      {/* Chat Section */}
      <div className="flex-1 bg-white border border-orange-200 rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-orange-100 bg-white">
          <div className="flex items-center gap-3">
            <img src={SwishLogo} alt="Swish Assistant" className="h-10" />
            <span className="text-lg font-semibold text-orange-600">Swish Assistant</span>
          </div>
          <button
            onClick={handleReset}
            className="text-sm text-orange-600 hover:underline"
          >
            Reset
          </button>
        </div>

        {/* Mode Select */}
        <div className="px-6 pt-4 pb-2">
          <label className="block mb-1 text-sm font-medium text-neutral-700">
            Chat Mode
          </label>
          <select
            value={chatMode}
            onChange={(e) => setChatMode(e.target.value)}
            className="border border-gray-300 p-2 rounded-md w-full sm:w-auto"
          >
            <option value="general">🧠 General</option>
            <option value="scouting">🕵️ Scouting</option>
            <option value="post_game">📋 Post Game</option>
            <option value="social">📣 Social</option>
          </select>
        </div>

        {/* Chat Area */}
        <div className="p-4">
          <ChatArea
            key={resetKey}
            externalMode={chatMode}
            onScoutingResponse={(res) => setLatestScouting(res)}
          />
        </div>
      </div>

      {/* Player Card (right side) */}
      {chatMode === "scouting" && latestScouting && (
        <div className="w-1/3 p-4 border-l border-orange-200 bg-white rounded-xl shadow-md">
          <h2 className="text-lg font-bold mb-2">📇 Scouting Card</h2>
          <div className="whitespace-pre-wrap text-sm text-gray-800">{latestScouting}</div>
          <button
            onClick={() => {}}
            className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600"
          >
            Send to Scout Builder
          </button>
        </div>
      )}
    </div>
  );
};

export default ChatContainer;
