import { ReactNode } from "react";
import { 
  AutoAwesome, 
  Share, 
  Slideshow, 
  Web, 
  Brush, 
  Smartphone, 
  VideoLibrary,
  Inventory2
} from "@mui/icons-material";

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
}

const FeatureCard = ({ icon, title, description }: FeatureCardProps) => {
  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg border border-neutral-200">
      <div className="p-6">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
          <div className="text-primary">{icon}</div>
        </div>
        <h3 className="text-lg font-medium text-neutral-900 mb-2">{title}</h3>
        <p className="text-neutral-600 text-sm">{description}</p>
      </div>
    </div>
  );
};

const features: FeatureCardProps[] = [
  {
    icon: <AutoAwesome />,
    title: "Design for me",
    description: "Let our AI generate complete designs based on your description"
  },
  {
    icon: <Share />,
    title: "Social media",
    description: "Create engaging content for Instagram, Facebook, Twitter and more"
  },
  {
    icon: <Slideshow />,
    title: "Presentation",
    description: "Build professional slide decks with compelling visuals"
  },
  {
    icon: <Web />,
    title: "Website",
    description: "Generate modern, responsive website designs"
  },
  {
    icon: <Brush />,
    title: "Brand identity",
    description: "Develop logos, color schemes and brand guidelines"
  },
  {
    icon: <Smartphone />,
    title: "Mobile app",
    description: "Design user interfaces for iOS and Android applications"
  },
  {
    icon: <VideoLibrary />,
    title: "Video content",
    description: "Create storyboards and video asset designs"
  },
  {
    icon: <Inventory2 />,
    title: "Product design",
    description: "Design packaging, marketing materials and more"
  }
];

export default function FeatureCards() {
  const firstRowFeatures = features.slice(0, 4);
  const secondRowFeatures = features.slice(4);

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl font-semibold text-neutral-900 mb-8">Popular design options</h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {firstRowFeatures.map((feature, index) => (
            <FeatureCard
              key={`feature-1-${index}`}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
        
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {secondRowFeatures.map((feature, index) => (
            <FeatureCard
              key={`feature-2-${index}`}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
