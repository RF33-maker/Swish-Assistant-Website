import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import HeroSection from "@/components/home/hero-section";
import FeatureCards from "@/components/home/feature-cards";
import VisualizationSection from "@/components/home/visualization-section";
import CustomizationSection from "@/components/home/customization-section";
import UploadSection from "@/components/home/upload-section";
import PreviewSection from "@/components/home/PreviewSection";



export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow">
        <HeroSection />
        <UploadSection /> 
        <FeatureCards />
        <VisualizationSection />
        <PreviewSection />
        <CustomizationSection />
      </main>
      <Footer />
    </div>
  );
}
