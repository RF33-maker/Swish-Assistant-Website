import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function CustomizationSection() {
  const [primaryColor, setPrimaryColor] = useState("#0d84e3");
  const [secondaryColor, setSecondaryColor] = useState("#1e293b");
  const [accentColor, setAccentColor] = useState("#22c55e");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onload = (event) => {
        if (event.target?.result) {
          setLogoPreview(event.target.result as string);
        }
      };
      
      reader.readAsDataURL(file);
    }
  };

  const applyBrandColors = () => {
    // This would implement the actual color changing functionality
    // by updating CSS variables or a theme context
    console.log("Applied brand colors:", { primaryColor, secondaryColor, accentColor });
  };

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 bg-neutral-50">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl font-semibold text-neutral-900 mb-2">Customization</h2>
        <p className="text-neutral-600 mb-8">Personalize your workspace with brand elements</p>
        
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Logo upload section */}
              <div>
                <h3 className="text-lg font-medium text-neutral-800 mb-4">Team Logo</h3>
                <div className="flex items-start">
                  <div className="mr-4 w-16 h-16 bg-neutral-100 rounded-md flex items-center justify-center border border-neutral-200 overflow-hidden">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Preview" className="h-full w-full object-contain" />
                    ) : (
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className="h-8 w-8 text-neutral-400"
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="logo-upload" className="block w-full px-4 py-2 text-sm text-center border border-neutral-300 rounded-md cursor-pointer bg-white hover:bg-neutral-50">
                      Upload logo
                      <Input 
                        id="logo-upload" 
                        type="file" 
                        className="sr-only" 
                        accept="image/*"
                        onChange={handleLogoUpload}
                      />
                    </Label>
                    <p className="mt-2 text-xs text-neutral-500">Recommended size: 200x200px. PNG or SVG format.</p>
                  </div>
                </div>
              </div>
              
              {/* Color customization section */}
              <div>
                <h3 className="text-lg font-medium text-neutral-800 mb-4">Brand Colors</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="primary-color" className="block text-sm font-medium text-neutral-700 mb-1">
                      Primary Color
                    </Label>
                    <div className="flex items-center">
                      <div 
                        className="w-8 h-8 rounded-md mr-2" 
                        style={{ backgroundColor: primaryColor }}
                      ></div>
                      <Input 
                        type="text" 
                        id="primary-color" 
                        value={primaryColor} 
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="flex-1" 
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="secondary-color" className="block text-sm font-medium text-neutral-700 mb-1">
                      Secondary Color
                    </Label>
                    <div className="flex items-center">
                      <div 
                        className="w-8 h-8 rounded-md mr-2" 
                        style={{ backgroundColor: secondaryColor }}
                      ></div>
                      <Input 
                        type="text" 
                        id="secondary-color" 
                        value={secondaryColor} 
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="flex-1" 
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="accent-color" className="block text-sm font-medium text-neutral-700 mb-1">
                      Accent Color
                    </Label>
                    <div className="flex items-center">
                      <div 
                        className="w-8 h-8 rounded-md mr-2" 
                        style={{ backgroundColor: accentColor }}
                      ></div>
                      <Input 
                        type="text" 
                        id="accent-color" 
                        value={accentColor} 
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="flex-1" 
                      />
                    </div>
                  </div>
                  
                  <Button 
                    className="mt-2 w-full" 
                    onClick={applyBrandColors}
                  >
                    Apply Brand Colors
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
