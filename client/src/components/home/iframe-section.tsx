import { RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function IframeSection() {
  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl font-semibold text-neutral-900 mb-2">Preview</h2>
        <p className="text-neutral-600 mb-8">Interactive preview of your design</p>
        
        <div className="bg-neutral-100 border border-neutral-200 rounded-xl shadow-md overflow-hidden">
          <div className="border-b border-neutral-200 px-6 py-4 bg-neutral-50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="icon" className="text-neutral-500 hover:text-neutral-700">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <div className="flex-1 max-w-2xl">
                <div className="bg-white rounded px-3 py-1 text-sm text-neutral-600 border border-neutral-300">
                  preview.yourdesign.com
                </div>
              </div>
            </div>
            <div>
              <Button variant="ghost" size="icon" className="text-neutral-500 hover:text-neutral-700">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div id="iframe-container" className="h-96 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto flex items-center justify-center rounded-full bg-neutral-200">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-8 w-8 text-neutral-500"
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <polyline points="16 18 22 12 16 6"></polyline>
                  <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
              </div>
              <p className="mt-4 text-neutral-500">Interactive preview will be displayed here</p>
              <Button className="mt-4">
                Load Preview
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
