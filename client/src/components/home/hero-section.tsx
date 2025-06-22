import SwishAssistantLogo from "@/assets/Swish Assistant Logo.png";
import ChatContainer from "@/components/chat/ChatContainer";

export default function HeroSection() {
  return (
    <section
      id="Chatbot"
      className="relative min-h-screen flex flex-col items-center justify-center px-4 py-20 bg-gradient-to-br from-white via-orange-50 to-orange-100 overflow-hidden"
    >
      {/* ✅ Offset background logo */}
      <div className="absolute top-1/4 right-[-200px] z-0 pointer-events-none">
        <img
          src={SwishAssistantLogo}
          alt="Swish Assistant Watermark"
          className="w-[900px] max-w-none opacity-10"
        />
      </div>

      {/* ✅ Title */}
      <h1 className="text-4xl sm:text-5xl font-bold text-orange-600 text-center mb-8 relative z-10">
        Welcome to Swish Assistant
      </h1>

      {/* ✅ Chat container */}
      <div className="relative z-10 w-full max-w-5xl">
        <ChatContainer />
      </div>
    </section>
  );
}
