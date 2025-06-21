import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import VisualizationSection from "@/components/LeagueAdmin/visualization-section-la";
import CustomizationSection from "@/components/LeagueAdmin/customization-section-la";
import UploadSection from "@/components/LeagueAdmin/upload-section-la";


export default function HomePage() {
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

          <div className="bg-white p-6 rounded-xl shadow-[0_4px_20px_rgba(255,115,0,0.1)] border max-h-[700px] overflow-auto">
            <h2 className="text-xl font-semibold text-slate-800 mb-4">League Stat PLaceholder</h2>
          
          </div>
        </div>

        {/* Visualization + Customization + League Table */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-[0_4px_20px_rgba(255,115,0,0.1)] border">
            <VisualizationSection />
          </div>

          <div className="bg-white p-6 rounded-xl shadow-[0_4px_20px_rgba(255,115,0,0.1)] border">
            <CustomizationSection />
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-2">League Table</h2>
              <p className="text-sm text-slate-600">This is a placeholder for the league standings component.</p>
            </div>
          </div>
        </div>
      </main>


      <Footer />
    </div>
  );
}
