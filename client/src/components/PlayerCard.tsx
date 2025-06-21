import React from "react";

interface PlayerCardProps {
  content: string;
  onSendToBuilder?: () => void;
}

const PlayerCard: React.FC<PlayerCardProps> = ({ content, onSendToBuilder }) => {
  // ✂️ Helper to extract sections by title
  const getSection = (label: string) => {
    const regex = new RegExp(`\\*\\*${label}\\*\\*\\n([\\s\\S]*?)(?=\\*\\*|$)`, "i");
    const match = content.match(regex);
    return match ? match[1].trim() : null;
  };

  const titleLine = content.split("\n")[0];
  const keyStats = getSection("Key Stats");
  const strengths = getSection("Strengths");
  const weaknesses = getSection("Weaknesses");
  const summary = getSection("Summary");
  const howToDefend = getSection("How to Defend");

  return (
    <div className="w-full h-fit p-5 border border-orange-200 bg-white rounded-2xl shadow-xl text-sm text-gray-900 whitespace-pre-wrap">
      <h2 className="text-xl font-bold text-blue-900 mb-2 flex items-center gap-2">
        🕵️ {titleLine.replace("**", "")}
      </h2>

      {keyStats && (
        <div className="mt-4">
          <h3 className="font-semibold text-gray-700 mb-1">📊 Key Stats</h3>
          <ul className="list-disc list-inside text-sm text-gray-800 space-y-1">
            {keyStats.split("\n").map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4">
        {strengths && (
          <div>
            <h3 className="font-semibold text-green-700 mb-1">✅ Strengths</h3>
            <ul className="list-disc list-inside text-sm text-gray-800 space-y-1">
              {strengths.split("\n").map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {weaknesses && (
          <div>
            <h3 className="font-semibold text-red-600 mb-1">❌ Weaknesses</h3>
            <ul className="list-disc list-inside text-sm text-gray-800 space-y-1">
              {weaknesses.split("\n").map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {summary && (
        <div className="mt-4">
          <h3 className="font-semibold text-gray-700 mb-1">🧠 Summary</h3>
          <p className="text-sm text-gray-700">{summary}</p>
        </div>
      )}

      {howToDefend && (
        <div className="mt-4">
          <h3 className="font-semibold text-gray-700 mb-1">🛡️ How to Defend</h3>
          <p className="text-sm italic text-gray-700">{howToDefend}</p>
        </div>
      )}

      {onSendToBuilder && (
        <button
          onClick={onSendToBuilder}
          className="mt-6 self-start px-4 py-2 bg-orange-500 text-white text-sm rounded-md hover:bg-orange-600 transition"
        >
          ➕ Send to Scout Builder
        </button>
      )}
    </div>
  );
};

export default PlayerCard;
