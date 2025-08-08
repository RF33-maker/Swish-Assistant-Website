import { useLocation } from "wouter"
import { Users, TrendingUp, Trophy, Settings } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import SwishLogo from "@/assets/Swish Assistant Logo.png"

export default function DashboardLanding() {
  const [, navigate] = useLocation();

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex items-center justify-between w-full mb-8">
          <Button 
            variant="outline" 
            onClick={() => navigate("/")}
            className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:border-orange-300"
          >
            ← Back to Home
          </Button>
        </div>
        
        <div className="flex flex-col items-center gap-3 mb-2">
          <img 
            src={SwishLogo} 
            alt="Swish Assistant" 
            className="h-16 w-auto object-contain"
          />
          <h2 className="text-center text-orange-600 font-semibold text-sm uppercase tracking-wide">
            Swish Assistant
          </h2>
        </div>
        <p className="mt-2 text-center text-4xl sm:text-5xl font-extrabold text-slate-900">
          Choose your mode
        </p>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="bg-white border-orange-200 shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/40 transition-all duration-300 cursor-pointer transform hover:scale-105 group" onClick={() => navigate("/league-management")}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-orange-600 group-hover:bg-orange-700 flex items-center justify-center transition-all duration-300 group-hover:rotate-12 group-hover:scale-110">
                    <Trophy className="h-6 w-6 text-white group-hover:animate-pulse" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-orange-900 text-lg group-hover:text-orange-700 transition-colors duration-300">League Management</CardTitle>
                    <CardDescription className="group-hover:text-orange-600 transition-colors duration-300">Create and manage your leagues</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-orange-700 text-sm mb-4">Create new leagues, upload game data, manage teams, and customize your league experience.</p>
                <Button 
                  size="sm" 
                  className="bg-orange-600 hover:bg-orange-700 text-white transform transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/league-management");
                  }}
                >
                  <Settings className="h-3 w-3 mr-1 group-hover:animate-bounce" />
                  Manage Leagues
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-white border-orange-200 shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/40 transition-all duration-300 cursor-pointer transform hover:scale-105 group" onClick={() => navigate("/coaches-hub")}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-orange-600 group-hover:bg-orange-700 flex items-center justify-center transition-all duration-300 group-hover:rotate-12 group-hover:scale-110">
                    <Users className="h-6 w-6 text-white group-hover:animate-pulse" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-orange-900 text-lg group-hover:text-orange-700 transition-colors duration-300">Coaches Hub</CardTitle>
                    <CardDescription className="group-hover:text-orange-600 transition-colors duration-300">Coaching tools and resources</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-orange-700 text-sm mb-4">Access coaching resources, game analysis tools, and team management features.</p>
                <Button 
                  size="sm" 
                  className="bg-orange-600 hover:bg-orange-700 text-white transform transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/coaches-hub");
                  }}
                >
                  <TrendingUp className="h-3 w-3 mr-1 group-hover:animate-bounce" />
                  Access Hub
                </Button>
              </CardContent>
            </Card>
        </div>
      </div>
    </div>
  )
}