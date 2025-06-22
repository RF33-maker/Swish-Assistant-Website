import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import VisualizationSection from "@/components/LeagueAdmin/visualization-section-la";
import CustomizationSection from "@/components/LeagueAdmin/customization-section-la";
import UploadSection from "@/components/LeagueAdmin/upload-section-la";
import SocialLinksEditor from "@/components/LeagueAdmin/social-links-editor";
import { useParams } from "wouter";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function HomePage() {
  const { slug } = useParams();
  const [league, setLeague] = useState<any>(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("Error fetching user:", error.message);
      } else {
        setUser(data?.user);
      }
    };

    fetchUser();
  }, []);

  useEffect(() => {
    const fetchLeague = async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("*")
        .eq("slug", slug)
        .single();

      if (error) {
        console.error("Error fetching league:", error.message);
      } else {
        setLeague(data);
      }
    };

    if (slug) fetchLeague();
  }, [slug]);

  if (user && league && user.id !== league.user_id) {
    return <div className="p-6 text-red-500">Access denied: You are not the league admin.</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />

      <main className="flex-grow p-6 max-w-7xl mx-auto space-y-10">


        

        {/* Page Title */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-orange-600">League Admin</h1>
          <p className="text-slate-600">This is your place to manage your league.</p>
        </div>

        {/* Upload + Chatbot Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-[0_4px_20px_rgba(255,115,0,0.1)] border">
            <h2 className="text-xl font-semibold text-slate-800 mb-4">Upload Game PDF</h2>
            <UploadSection />
          </div>

          <div className="bg-white p-6 rounded-xl shadow-[0_4px_20px_rgba(255,115,0,0.1)] border space-y-6">
            <CustomizationSection league={league} />
            {/* ✅ Social Media Embed Links */}
            {league?.instagram_embed_url && (
              <div className="my-6">
                <h2 className="text-xl font-bold mb-2 text-orange-600">Instagram</h2>
                <iframe
                  src={league.instagram_embed_url}
                  className="w-full h-[500px] rounded-xl border"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              </div>
            )}

            {league?.youtube_embed_url && (
              <div className="my-6">
                <h2 className="text-xl font-bold mb-2 text-orange-600">YouTube</h2>
                <iframe
                  src={league.youtube_embed_url}
                  className="w-full h-[500px] rounded-xl border"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-[0_4px_20px_rgba(255,115,0,0.1)] border">
          <CustomizationSection league={league} />
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-2">League Table</h2>
            <p className="text-sm text-slate-600">This is a placeholder for the league standings component.</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
