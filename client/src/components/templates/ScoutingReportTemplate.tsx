import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

const exampleHTML = `
  <div>
    <h1 class="text-2xl font-bold text-neutral-900">Scouting Report: Rhys Farrell</h1>
    <p class="text-sm text-neutral-600">Position: Guard | Team: Gloucester Kings</p>
    <p class="mt-2 text-sm text-neutral-700">🕹️ Last Game: 22 pts, 7 reb, 4 ast</p>

    <div class="grid grid-cols-2 gap-6 mt-6">
      <div>
        <h2 class="text-lg font-semibold text-green-700 mb-1">✅ Strengths</h2>
        <ul class="list-disc pl-5 text-sm text-neutral-800">
          <li>Strong off-the-dribble shooting</li>
          <li>Excellent on-ball defense</li>
          <li>Great in transition</li>
        </ul>
      </div>
      <div>
        <h2 class="text-lg font-semibold text-red-700 mb-1">⚠️ Weaknesses</h2>
        <ul class="list-disc pl-5 text-sm text-neutral-800">
          <li>Struggles with shot selection</li>
          <li>Can be turnover-prone under pressure</li>
        </ul>
      </div>
    </div>

    <div class="mt-6">
      <h3 class="text-md font-medium text-neutral-900">📈 Overall Trend</h3>
      <p class="text-sm text-neutral-700">Rhys has averaged 18.7 points over the last 3 games and is showing increased aggression attacking the rim.</p>
    </div>
  </div>
`;

export default function ScoutingReportTemplate() {
  const editor = useEditor({
    extensions: [StarterKit],
    content: exampleHTML,
  });

  return (
    <div className="border border-neutral-300 bg-white rounded-lg p-6 shadow-sm">
      <EditorContent
        editor={editor}
        className="text-black bg-white min-h-[350px] prose prose-sm sm:prose lg:prose-lg max-w-none"
      />
    </div>
  );
}
