import { BarChart2, Settings, UserCircle2, UploadCloud } from "lucide-react";



const features = [
  {
    title: "Visualizations",
    description: "Generate charts and shot maps from LiveStats files.",
    icon: <BarChart2 className="w-6 h-6 md:w-8 md:h-8 text-orange-500" />,
    onClick: () => {
      const el = document.getElementById("visualization");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    },
  },
  {
    title: "Scouting Report",
    description: "The responses you asked the chatbot ready instantly to send to your players and coaching staff.",
    icon: <Settings className="w-6 h-6 md:w-8 md:h-8 text-orange-500" />,
    onClick: () => {
      const el = document.getElementById("customization");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    },
  },
  {
    title: "Player Profiles",
    description: "Drill into stats and trends for every athlete.",
    icon: <UserCircle2 className="w-6 h-6 md:w-8 md:h-8 text-orange-500" />,
    onClick: () => {
      // Placeholder — add link or tab switch later
    },
  },
  {
    title: "Upload LiveStats PDF",
    description: "Securely upload your game's stat sheet to analyze stats.",
    icon: <UploadCloud className="w-6 h-6 md:w-8 md:h-8 text-orange-500" />,
    onClick: () => {
      window.open("https://www.dropbox.com/home", "_blank"); // Placeholder for future Dropbox OAuth
    },
  },
];

export default function FeatureCards() {
  return (
    <section id="features" className="bg-white py-8 md:py-12 px-4 md:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {features.map((feature, index) => (
          <button
            key={index}
            onClick={feature.onClick}
            className="flex flex-col items-start p-4 md:p-6 bg-neutral-50 border border-neutral-200 rounded-xl shadow-sm hover:shadow-md hover:bg-orange-50 transition transform hover:scale-[1.02] text-left"
          >
            <div className="mb-3 md:mb-4">{feature.icon}</div>
            <h3 className="text-base md:text-lg font-semibold text-neutral-800 mb-2">{feature.title}</h3>
            <p className="text-sm md:text-base text-neutral-600">{feature.description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
