
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Settings, Users, Trophy, Calendar, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SwishLogo from "@/assets/Swish Assistant Logo.png";

interface League {
  league_id: string;
  name: string;
  slug: string;
  banner_url?: string;
  created_at: string;
  is_public: boolean;
  approved: boolean;
}

export default function LeagueManagement() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLeagueName, setNewLeagueName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserLeagues();
    }
  }, [user]);

  const fetchUserLeagues = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leagues')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching leagues:', error);
        toast({
          title: "Error Loading Leagues",
          description: "Failed to load your leagues from database",
          variant: "destructive",
        });
        return;
      }

      setLeagues(data || []);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Something went wrong while loading leagues",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createLeague = async () => {
    if (!user || !newLeagueName.trim()) return;

    setCreating(true);
    try {
      // Create slug from league name
      const slug = newLeagueName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

      // Check if slug already exists
      const { data: existingLeague } = await supabase
        .from('leagues')
        .select('slug')
        .eq('slug', slug)
        .single();

      if (existingLeague) {
        toast({
          title: "League Name Taken",
          description: "A league with this name already exists. Please choose a different name.",
          variant: "destructive",
        });
        setCreating(false);
        return;
      }

      const { data, error } = await supabase
        .from('leagues')
        .insert({
          name: newLeagueName.trim(),
          slug: slug,
          user_id: user.id,
          created_by: user.id,
          is_public: isPublic,
          approved: true
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating league:', error);
        toast({
          title: "Error Creating League",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "League Created!",
        description: `${newLeagueName} has been created successfully.`,
      });

      setNewLeagueName("");
      setIsPublic(true);
      setShowCreateForm(false);
      fetchUserLeagues(); // Refresh the list
    } catch (error) {
      console.error('Error creating league:', error);
      toast({
        title: "Error",
        description: "Failed to create league",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleLeagueClick = (slug: string) => {
    setLocation(`/league-admin/${slug}`);
  };

  const handleViewLeague = (slug: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLocation(`/league/${slug}`);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-4">You need to be logged in to access league management.</p>
          <Button onClick={() => setLocation('/auth')}>
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your leagues...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setLocation('/')}
                className="text-gray-600 hover:text-gray-800"
              >
                <img src={SwishLogo} alt="Swish" className="h-8" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">League Management</h1>
                <p className="text-gray-600">Create and manage your leagues</p>
              </div>
            </div>
            <Button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create League
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Create League Form */}
        {showCreateForm && (
          <Card className="mb-8 bg-white border-orange-200 shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/30 transition-all duration-300">
            <CardHeader>
              <CardTitle className="text-orange-800">Create New League</CardTitle>
              <CardDescription>
                Enter a name for your new league. A URL-friendly slug will be generated automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Input
                  placeholder="Enter league name..."
                  value={newLeagueName}
                  onChange={(e) => setNewLeagueName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createLeague()}
                  className="flex-1 border-orange-200 focus:border-orange-400"
                /></div>
              
              <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex-1">
                  <h4 className="font-medium text-orange-900 mb-1">League Visibility</h4>
                  <p className="text-sm text-orange-700">
                    {isPublic 
                      ? "Public leagues can be discovered and viewed by anyone" 
                      : "Private leagues are only visible to you and invited members"
                    }
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${!isPublic ? 'text-orange-900' : 'text-orange-600'}`}>
                    Private
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsPublic(!isPublic)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${
                      isPublic ? 'bg-orange-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isPublic ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className={`text-sm font-medium ${isPublic ? 'text-orange-900' : 'text-orange-600'}`}>
                    Public
                  </span>
                </div>
              </div>
              
              <div className="flex gap-4">
                <Button
                  onClick={createLeague}
                  disabled={!newLeagueName.trim() || creating}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {creating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewLeagueName("");
                    setIsPublic(true);
                  }}
                  className="border-orange-200 text-orange-700 hover:bg-orange-50"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Leagues Grid */}
        {leagues.length === 0 ? (
          <Card className="bg-white border-orange-200 shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/30 transition-all duration-300">
            <CardContent className="p-12 text-center">
              <Trophy className="h-16 w-16 text-orange-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-orange-900 mb-2">No Leagues Yet</h3>
              <p className="text-orange-600 mb-6">
                Create your first league to start managing teams, players, and games.
              </p>
              <Button
                onClick={() => setShowCreateForm(true)}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Your First League
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {leagues.map((league) => (
              <Card 
                key={league.league_id}
                className="bg-white border-orange-200 shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/40 transition-all duration-300 cursor-pointer transform hover:scale-105 group"
                onClick={() => handleLeagueClick(league.slug)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-orange-900 text-lg group-hover:text-orange-700 transition-colors duration-300 mb-2">
                        {league.name}
                      </CardTitle>
                      <CardDescription className="text-orange-600">
                        Created {new Date(league.created_at).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Badge 
                        variant={league.is_public ? "default" : "secondary"}
                        className={league.is_public ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                      >
                        {league.is_public ? "Public" : "Private"}
                      </Badge>
                      <Badge 
                        variant={league.approved ? "default" : "destructive"}
                        className={league.approved ? "bg-blue-100 text-blue-800" : ""}
                      >
                        {league.approved ? "Approved" : "Pending"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* League Banner Preview */}
                  {league.banner_url && (
                    <div className="mb-4 rounded-lg overflow-hidden">
                      <img 
                        src={league.banner_url} 
                        alt={`${league.name} banner`}
                        className="w-full h-32 object-cover"
                      />
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-orange-700">
                      <Calendar className="h-3 w-3" />
                      <span>/{league.slug}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="border-orange-300 text-orange-700 hover:bg-orange-50"
                        onClick={(e) => handleViewLeague(league.slug, e)}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button 
                        size="sm" 
                        className="bg-orange-600 hover:bg-orange-700 text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLeagueClick(league.slug);
                        }}
                      >
                        <Settings className="h-3 w-3 mr-1" />
                        Manage
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
