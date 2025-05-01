import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import HeroSection from "@/components/home/hero-section";
import FeatureCards from "@/components/home/feature-cards";
import VisualizationSection from "@/components/home/visualization-section";
import IframeSection from "@/components/home/iframe-section";
import CustomizationSection from "@/components/home/customization-section";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow">
        <HeroSection />
        <FeatureCards />
        <VisualizationSection />
        <IframeSection />
        <CustomizationSection />
      </main>
      <Footer />
    </div>
  );
}
