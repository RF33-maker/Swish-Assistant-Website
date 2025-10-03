import { useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import ScoutingReportTemplate from "@/components/templates/ScoutingReportTemplate";
import BlankCanvasTemplate from "@/components/templates/BlankCanvasTemplate";
import PostGameReport from "@/components/templates/PostGameReport";
import PreGameReport from "@/components/templates/PreGameReport";
import PostGameSummary from "@/components/templates/PostGameSummary";


const templates = {
  basic: "Scouting Report\n\nPlayer: Rhys Farrell\n\nSummary:\n- Points: 22\n- Assists: 4\n- Rebounds: 7",
  detailed: "Detailed Report\n\n📊 Rhys Farrell had an impressive game with 22 points, 4 assists, and 7 rebounds. His shot selection was excellent and defense consistent.",
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
  
  const templateComponents: Record<string, JSX.Element> = {
    scouting: <ScoutingReportTemplate />,
    blank: <BlankCanvasTemplate />,
    postgame: <PostGameReport />,
    pregame: <PreGameReport />,
    summary: <PostGameSummary />,
  };

  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScoutInsert = (e: any) => {
      const summary = e.detail;
      if (editor) {
        editor.commands.setContent(summary);
        sectionRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    };

    window.addEventListener("scout-insert", handleScoutInsert);
    return () => window.removeEventListener("scout-insert", handleScoutInsert);
  }, [editor]);


  return (
    <section 
      ref={sectionRef}
      className="py-8 md:py-12 px-4 md:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="mb-3 md:mb-4">
          <h2 className="text-xl md:text-2xl font-semibold text-neutral-900 mb-1">Preview</h2>
          <p className="text-sm md:text-base text-neutral-600">Interactive scouting report</p>
        </div>

        <div className="mb-4">
          <label className="block mb-2 text-xs md:text-sm text-neutral-700">Choose Template</label>
          <select
            className="w-full md:w-auto border border-neutral-300 rounded-md p-2 md:p-3 text-sm md:text-base"
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
          >
            <option value="scouting">🧾 Scouting Report</option>
            <option value="blank">📝 Blank Canvas</option>
            <option value="postgame">🏀 Post Game Report</option>
            <option value="pregame">📋 Pre Game Report</option>
            <option value="summary">📈 Post Game Summary</option>
          </select>
          <div className="mt-3 md:mt-4 bg-white p-4 md:p-6 border rounded-md shadow">
            {templateComponents[selectedTemplate]}
          </div>


        </div>

        <div className="bg-neutral-100 p-3 md:p-4 rounded-lg shadow-md border border-neutral-300">
          {editor && (
            <EditorContent
              editor={editor}
              className="text-black bg-white p-3 md:p-4 rounded-md border border-gray-200 shadow-sm min-h-[150px] md:min-h-[200px]"
            />
          )}
        </div>
      </div>
    </section>
  );
}

