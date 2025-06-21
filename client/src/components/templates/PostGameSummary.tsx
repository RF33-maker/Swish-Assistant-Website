export default function PostGameReport() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center border-b pb-4">
        <h1 className="text-2xl font-bold">Post Game Report</h1>
        <p className="text-lg text-neutral-700">Gloucester Kings vs Plymouth Patriots</p>
        <p className="text-sm text-neutral-500">Final Score: 86 - 79</p>
        <p className="text-sm text-neutral-500">Date: May 9, 2025</p>
      </div>

      {/* AI Summary Section */}
      <div>
        <h2 className="text-lg font-semibold mb-2">📊 Game Summary</h2>
        <p className="text-neutral-800 italic">
          This section will be automatically populated with an AI-generated summary of the game based on the uploaded LiveStats PDF.
        </p>
      </div>

      {/* Player of the Game */}
      <div>
        <h2 className="text-lg font-semibold mb-2">🏅 Player of the Game</h2>
        <p className="text-neutral-800">
          Highlight standout player performance here, including key stats and moments.
        </p>
      </div>
    </div>
  );
}
