// components/LeagueAdmin/social-links-editor.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SocialLinksEditor({ leagueId }: { leagueId: string }) {
  const [instagram, setInstagram] = useState("");
  const [youtube, setYouTube] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLinks = async () => {
      const { data } = await supabase.from("leagues").select("instagram_embed_url, youtube_embed_url").eq("id", leagueId).single();
      if (data) {
        setInstagram(data.instagram_embed_url || "");
        setYouTube(data.youtube_embed_url || "");
      }
      setLoading(false);
    };
    if (leagueId) fetchLinks();
  }, [leagueId]);

  const handleSave = async () => {
    const { error } = await supabase
      .from("leagues")
      .update({ instagram_url, youtube_url })
      .eq("id", leagueId);

    if (error) console.error(error.message);
  };


  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-2">Social Media Embeds</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Instagram Embed URL</label>
          <input
            type="text"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
            placeholder="e.g. https://www.instagram.com/p/xyz/embed"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">YouTube Embed URL</label>
          <input
            type="text"
            value={youtube}
            onChange={(e) => setYouTube(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
            placeholder="e.g. https://www.youtube.com/embed/xyz"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={loading}
          className="bg-orange-500 text-white px-4 py-2 rounded mt-2"
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
