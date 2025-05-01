import PromptInput from "./prompt-input";

export default function HeroSection() {
  return (
    <section className="bg-gradient-to-b from-white to-neutral-100 pt-12 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-neutral-900 tracking-tight">
          What will you design today?
        </h1>
        <p className="mt-6 text-xl text-neutral-600">
          Use our AI-powered tools to create stunning designs in minutes
        </p>
        
        <PromptInput />
      </div>
    </section>
  );
}
