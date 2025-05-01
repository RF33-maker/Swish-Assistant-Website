import { Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VisualizationSection() {
  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 bg-neutral-50">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl font-semibold text-neutral-900 mb-2">Visualization</h2>
        <p className="text-neutral-600 mb-8">Watch your designs come to life in real-time</p>
        
        <div className="bg-white shadow-lg rounded-xl overflow-hidden">
          <div className="border-b border-neutral-200 px-6 py-4 bg-neutral-50 flex items-center justify-between">
            <div className="flex items-center">
              <div className="h-3 w-3 bg-red-500 rounded-full"></div>
              <div className="ml-2 h-3 w-3 bg-yellow-500 rounded-full"></div>
              <div className="ml-2 h-3 w-3 bg-green-500 rounded-full"></div>
              <span className="ml-4 text-sm text-neutral-500">Design Preview</span>
            </div>
            <div>
              <Button variant="ghost" size="icon">
                <Maximize className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="p-6 h-64 flex items-center justify-center bg-neutral-100">
            <div className="text-center">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-12 w-12 mx-auto text-neutral-400"
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
              </svg>
              <p className="mt-4 text-neutral-500">Your design visualization will appear here</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
