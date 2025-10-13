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
    - **Player Profiles**: Individual player pages at `/player/[id]` showing season averages and game-by-game stats, with AI-powered analysis.
    - **Game Results**: Redesigned game results section with horizontal scrolling ticker and detailed game view modals with team-filtered box scores.
    - **Statistical Leaderboards**: `/league-leaders/[slug]` displays top players across 9 statistical categories.

## SEO Implementation
- **Dynamic Sitemap**: Automated sitemap generation via `scripts/generate-sitemap.ts` that queries Supabase for all public leagues, teams, and players. Run `npx tsx scripts/generate-sitemap.ts` to regenerate. Sitemap is served as a static file at `/sitemap.xml` with proper XML structure including lastmod dates, changefreq, and priority values.
  - ✅ **SEO-Friendly URLs**: Player pages now use human-readable slugs (e.g., `/player/john-doe`) instead of UUIDs for better search engine optimization
  - 📊 Current stats: 858 URLs (4 leagues, 63 teams, 776 players with slugs)
  - 🔄 Slug generation: Run `npx tsx scripts/generate-player-slugs.ts` to populate slugs for new players
- **Robots.txt**: Configured to allow crawling while blocking sensitive routes (/auth, /admin, /api, etc.) and includes sitemap reference. Includes crawl-delay directive to prevent aggressive crawling.
- **Meta Tags**: All pages include SEO meta tags, Open Graph tags for social sharing, and canonical links (implementation in progress).
- **URL Structure**: 
  - Leagues: `/league/[slug]` (e.g., `/league/british-championship-basketball-20252026`)
  - Teams: `/team/[slug]` (e.g., `/team/reading-rockets`)
  - Players: `/player/[slug]` (e.g., `/player/john-doe`) - includes backward compatibility for UUID-based URLs

## External Dependencies
- **Supabase**: Used for database storage, user authentication, and object storage (e.g., `team-logos`, `league-banners`).
- **Python Flask Backend (https://sab-backend.onrender.com)**: An external service that handles file processing, document parsing, and AI-powered chatbot functionality (e.g., player analysis using OpenAI API).
- **Instagram**: Integrated for displaying league-owner configured Instagram profiles or specific posts in the sidebar.