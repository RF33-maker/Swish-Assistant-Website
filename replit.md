# React Frontend with Express Backend

## Overview
This project delivers a professional React and Tailwind CSS website featuring user authentication and an interactive homepage. Its primary purpose is to provide a robust platform for managing league data, team statistics, and integrating AI-powered coaching tools. Key capabilities include:
- Secure user authentication and protected routes.
- Display of league standings, team profiles, and player statistics.
- File upload and document parsing for enhanced data analysis.
- AI-powered chatbot and analysis for coaching insights.
- Dynamic content updates like league banners and team logos.
The business vision is to create a comprehensive sports league management and analysis platform, leveraging AI to offer unique coaching and performance insights, targeting amateur and semi-professional sports organizations.

## User Preferences
- Use modern React patterns with hooks
- Implement responsive design for all screen sizes
- Focus on clean, professional UI/UX
- Maintain separation between frontend and backend concerns

## System Architecture
The application is structured into a React frontend and integrates with external backend services.

**Frontend (React with Vite, Tailwind CSS, shadcn/ui, Wouter):**
- **Structure**: Organized into `pages/` for main views, `components/` for reusable UI elements, `lib/` for utilities and configurations, and `hooks/` for custom React hooks.
- **UI/UX Decisions**: Emphasizes a clean, professional design with a focus on readability and intuitive navigation. Utilizes a softer orange color palette (orange-50/100/300/400/700/800) for better aesthetics, with white backgrounds and soft orange borders (border-orange-200/300) for cards. Playful micro-interactions, hover animations, and smooth transitions are incorporated.
- **Technical Implementations**:
    - **Authentication**: Supabase handles user authentication and session management, securing routes.
    - **Routing**: `Wouter` is used for client-side routing, enabling dynamic page navigation.
    - **Data Display**: Features interactive tables for league standings with detailed statistics (Win%, PF, PA, Diff), sorted by win percentage. Animated team performance trend visualizer shows team progress over time.
    - **Content Management**: Provides administrative interfaces for league owners to upload custom banners and manage team logos, which are integrated throughout the platform (standings, profiles, scoreboards).
    - **Search & Filtering**: Comprehensive search for players and leagues, with filtering capabilities on player lists.
    - **Coaching Tools**: Dedicated Coaches Hub with integrated League Assistant (chatbot) for insights, scouting reports with document editing capabilities, and a "Coming Soon" section for LLM coaching material.
- **Feature Specifications**:
    - **League Management**: Centralized `/league-admin/:slug` route for owners to manage logos, banners, and Instagram integration.
    - **Team Pages**: Dedicated `/league/:slug/teams` for displaying all teams in a league, and `/team/:teamName` for individual team profiles with statistics and recent games.
    - **Player Profiles**: Individual player pages at `/player/[slug]` showing season averages and game-by-game stats, with AI-powered analysis. **Fuzzy Matching**: Automatically consolidates duplicate player records across competitions using Jaro-Winkler similarity (85% threshold) to handle name variations, typos, and initials (e.g., "Rhys Farrell", "R Farrell", "R Farell"). League filter dropdown allows viewing combined stats across all competitions or filtered stats per individual league. Name variations indicator shows which name format appears in each competition.
    - **Game Results**: Redesigned game results section with horizontal scrolling ticker and detailed game view modals with team-filtered box scores.
    - **Statistical Leaderboards**: `/league-leaders/[slug]` displays top players across 9 statistical categories.
    - **Player Statistics Table**: Comprehensive table on league pages displaying full traditional basketball box score statistics with 25 columns (Player, GP, MIN, FGM, FGA, FG%, 2PM, 2PA, 2P%, 3PM, 3PA, 3P%, FTM, FTA, FT%, ORB, DRB, TRB, AST, STL, BLK, TO, PF, +/-, PTS). Features include sortable columns, averages/totals toggle, search filtering, mobile-responsive horizontal scrolling with sticky player column, and comprehensive legend explaining all abbreviations.
    - **Team Statistics Table**: Comprehensive table on league pages displaying full traditional basketball box score statistics with 27 columns (Logo, Team, GP, FGM, FGA, FG%, 2PM, 2PA, 2P%, 3PM, 3PA, 3P%, FTM, FTA, FT%, ORB, DRB, TRB, AST, STL, BLK, TO, PF, +/-, PTS, PITP, FB PTS, 2ND CH). Features include averages/totals toggle, mobile-responsive horizontal scrolling with sticky logo column, and comprehensive legend explaining all 26 statistical abbreviations including advanced metrics (Points in Paint, Fastbreak Points, Second Chance Points).

## SEO Implementation
- **Dynamic Sitemap**: Automated sitemap generation via `scripts/generate-sitemap.ts` that queries Supabase for all public leagues, teams, and players. Run `npx tsx scripts/generate-sitemap.ts` to regenerate. Sitemap is served as a static file at `/sitemap.xml` with proper XML structure including lastmod dates, changefreq, and priority values.
  - ✅ **SEO-Friendly URLs**: Player pages now use human-readable slugs (e.g., `/player/john-doe`) instead of UUIDs for better search engine optimization
  - 📊 Current stats: 871 URLs (5 leagues including SLB Championship 2025-26, 72 teams, 776 players with slugs)
  - 🔄 Slug generation: Run `npx tsx scripts/generate-player-slugs.ts` to populate slugs for new players
- **Robots.txt**: Configured to allow crawling while blocking sensitive routes (/auth, /admin, /api, etc.) and includes sitemap reference. Includes crawl-delay directive to prevent aggressive crawling.
- **Meta Tags**: Comprehensive meta tag implementation across all pages:
  - **League Pages**: Use custom editable `league.description` field for meta descriptions, with fallback to generic text. Includes Open Graph tags, canonical links, and Twitter cards.
  - **Team Pages**: Use custom editable `team.description` field for meta descriptions. Full Open Graph, Twitter card, and canonical link support.
  - **Player Pages**: Dynamic meta descriptions with player name, team, and season averages (e.g., "averaging 15.3 PPG"). Includes comprehensive social media tags.
  - **Default (index.html)**: Mentions all supported leagues including NBL, WNBL, BCB, and SLB Championship.
- **Editable SEO Descriptions**: League owners can add/edit custom descriptions for leagues and teams that appear in page content and are used for meta descriptions. Implemented via `EditableDescription` component with inline editing and auto-save functionality.
  - League descriptions appear in "About This League" section above League Leaders and in meta tags
  - Team descriptions appear in the team profile sidebar and in meta tags
  - Requires `description` column (text, nullable) in both `leagues` and `teams` tables in Supabase
- **URL Structure**: 
  - Leagues: `/league/[slug]` (e.g., `/league/british-championship-basketball-20252026`)
  - Teams: `/team/[slug]` (e.g., `/team/reading-rockets`)
  - Players: `/player/[slug]` (e.g., `/player/john-doe`) - includes backward compatibility for UUID-based URLs

## External Dependencies
- **Supabase**: Used for database storage, user authentication, and object storage (e.g., `team-logos`, `league-banners`).
- **Python Flask Backend (https://sab-backend.onrender.com)**: An external service that handles file processing, document parsing, and AI-powered chatbot functionality (e.g., player analysis using OpenAI API).
- **Instagram**: Enhanced carousel integration for displaying multiple Instagram posts/reels in league sidebar:
  - Auto-scrolling carousel with 6-second intervals
  - Manual navigation controls (prev/next arrows, dot indicators)
  - Play/pause toggle for auto-scroll
  - Large display format (650px height) for better visibility
  - Video playback support for Instagram reels
  - League owners can manage multiple Instagram URLs through admin interface
  - URLs stored as JSON array in existing `instagram_embed_url` field (backward compatible with single URL)
  - URL normalization prevents duplicates (removes trailing slashes, query params)
  - Supports profile URLs, post URLs (`/p/`), and reel URLs (`/reel/`, `/reels/`)
  - Component: `InstagramCarousel.tsx` using Embla Carousel with Autoplay plugin