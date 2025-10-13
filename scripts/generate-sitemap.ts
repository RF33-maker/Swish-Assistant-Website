#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Create Supabase client - use environment variables without fallbacks for security
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Error: Missing Supabase credentials in environment variables");
  console.error("   Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env file");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateSitemap() {
  try {
    console.log("🗺️ Generating sitemap...");
    
    const today = new Date().toISOString().split('T')[0];

    // Fetch all public leagues
    const { data: leagues, error: leaguesError } = await supabase
      .from("leagues")
      .select("slug, name, created_at")
      .eq("is_public", true)
      .order("created_at", { ascending: false });

    if (leaguesError) {
      console.error("❌ Error fetching leagues:", leaguesError);
      throw new Error(`Failed to fetch leagues: ${leaguesError.message}`);
    }

    // Fetch all distinct teams from the teams table
    const { data: teamsData, error: teamsError } = await supabase
      .from("teams")
      .select("name, league_id");

    let teams: any[] = [];
    
    if (teamsError) {
      console.error("❌ Error fetching teams:", teamsError);
      console.log("   Trying alternative query from player_stats...");
      
      // Fallback: try getting teams from player_stats
      const { data: teamStats, error: statsError } = await supabase
        .from("player_stats")
        .select("team_name, team, league_id");
      
      if (statsError) {
        console.error("❌ Error fetching teams from player_stats:", statsError);
        console.log("   Continuing without teams...");
      } else {
        const teamsMap = new Map();
        teamStats?.forEach(stat => {
          const teamName = stat.team_name || stat.team;
          if (teamName) {
            const key = `${teamName}-${stat.league_id}`;
            if (!teamsMap.has(key)) {
              teamsMap.set(key, { name: teamName, league_id: stat.league_id });
            }
          }
        });
        teams = Array.from(teamsMap.values());
      }
    } else {
      teams = teamsData || [];
    }

    // Fetch all distinct players
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, full_name");

    if (playersError) {
      console.error("❌ Error fetching players:", playersError);
      console.log("   Continuing without players...");
    }

    // Build XML sitemap
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Add homepage
    xml += '  <url>\n';
    xml += '    <loc>https://www.swishassistant.com/</loc>\n';
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += '    <changefreq>daily</changefreq>\n';
    xml += '    <priority>1.0</priority>\n';
    xml += '  </url>\n';

    // Add static pages
    const staticPages = [
      { path: '/coaches-hub', changefreq: 'weekly', priority: '0.8' },
      { path: '/teams-list', changefreq: 'weekly', priority: '0.7' },
      { path: '/players-list', changefreq: 'weekly', priority: '0.7' },
      { path: '/privacy', changefreq: 'monthly', priority: '0.3' },
      { path: '/terms', changefreq: 'monthly', priority: '0.3' },
      { path: '/cookies', changefreq: 'monthly', priority: '0.3' },
    ];

    staticPages.forEach(page => {
      xml += '  <url>\n';
      xml += `    <loc>https://www.swishassistant.com${page.path}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += '  </url>\n';
    });

    // Add league pages
    leagues?.forEach(league => {
      xml += '  <url>\n';
      xml += `    <loc>https://www.swishassistant.com/league/${league.slug}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += '    <changefreq>daily</changefreq>\n';
      xml += '    <priority>0.9</priority>\n';
      xml += '  </url>\n';

      xml += '  <url>\n';
      xml += `    <loc>https://www.swishassistant.com/league-leaders/${league.slug}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += '    <changefreq>daily</changefreq>\n';
      xml += '    <priority>0.8</priority>\n';
      xml += '  </url>\n';

      xml += '  <url>\n';
      xml += `    <loc>https://www.swishassistant.com/league/${league.slug}/teams</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.7</priority>\n';
      xml += '  </url>\n';
    });

    // Add team pages
    teams.forEach(team => {
      const encodedTeamName = encodeURIComponent(team.name.toLowerCase().replace(/\s+/g, '-'));
      xml += '  <url>\n';
      xml += `    <loc>https://www.swishassistant.com/team/${encodedTeamName}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.6</priority>\n';
      xml += '  </url>\n';
    });

    // Add player pages
    players?.forEach(player => {
      xml += '  <url>\n';
      xml += `    <loc>https://www.swishassistant.com/player/${player.id}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.5</priority>\n';
      xml += '  </url>\n';
    });

    xml += '</urlset>';

    // Write to client/public/sitemap.xml
    const sitemapPath = path.resolve(process.cwd(), 'client', 'public', 'sitemap.xml');
    await fs.writeFile(sitemapPath, xml, 'utf-8');
    
    console.log(`✅ Sitemap generated successfully!`);
    console.log(`📊 Stats: ${leagues?.length || 0} leagues, ${teams.length} teams, ${players?.length || 0} players`);
    console.log(`📁 Saved to: ${sitemapPath}`);
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error generating sitemap:", error);
    process.exit(1);
  }
}

generateSitemap();
