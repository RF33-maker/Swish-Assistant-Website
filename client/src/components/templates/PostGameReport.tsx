import { useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@/components/ui/button";

const templates = {
  basic: "Scouting Report\n\nPlayer: Player Name\n\nSummary:\n- Points: 22\n- Assists: 4\n- Rebounds: 7",
  detailed: "Detailed Report\n\n📊 Player Name had an impressive game with 22 points, 4 assists, and 7 rebounds. His shot selection was excellent and defense consistent.",
  compact: "Rhys Farrell: 22 pts, 4 ast, 7 reb. Solid performance. 📈"
};

export default function PreviewSection() {
  const [selectedTemplate, setSelectedTemplate] = useState("basic");

  const editor = useEditor({
    extensions: [StarterKit],
    content: templates[selectedTemplate],
  });

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    editor?.commands.setContent(templates[templateKey]);
  };

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <h2 className="text-2xl font-semibold text-neutral-900 mb-1">Preview</h2>
          <p className="text-neutral-600">Interactive scouting report</p>
        </div>

        <div className="mb-4">
          <label className="block mb-2 text-sm text-neutral-700">Choose Template</label>
          <select
            className="border border-neutral-300 rounded-md p-2"
            value={selectedTemplate}
            onChange={(e) => handleTemplateChange(e.target.value)}
          >
            <option value="basic">📄 Basic</option>
            <option value="detailed">📝 Detailed</option>
            <option value="compact">🔍 Compact</option>
          </select>
        </div>

        <div className="bg-neutral-100 p-4 rounded-lg shadow-md border border-neutral-300">
          {editor && <EditorContent editor={editor} />}
        </div>
      </div>
    </section>
  );
}
