# React Frontend with Express Backend

## Overview
This project delivers a professional React and Tailwind CSS website with user authentication and an interactive homepage, designed for managing sports league data, team statistics, and integrating AI-powered coaching tools. Key capabilities include secure user authentication, display of league standings and player statistics, file upload for data analysis, and AI-powered chatbots for coaching insights. The business vision is to create a comprehensive sports league management and analysis platform, leveraging AI to offer unique coaching and performance insights for amateur and semi-professional sports organizations.

## User Preferences
- Use modern React patterns with hooks
- Implement responsive design for all screen sizes
- Focus on clean, professional UI/UX
- Maintain separation between frontend and backend concerns

## System Architecture
The application features a React frontend and integrates with external backend services.

**Frontend (React with Vite, Tailwind CSS, shadcn/ui, Wouter):**
-   **Structure**: Organized into `pages/`, `components/`, `lib/`, and `hooks/`.
-   **UI/UX Decisions**: Emphasizes a clean, professional design with a softer orange color palette, white backgrounds, and soft orange borders for cards. Incorporates playful micro-interactions and smooth transitions.
    -   **Dark Mode**: Site-wide dark mode support with localStorage persistence and a toggle button.
    -   **Team Branding Colors**: Dynamically extracts vibrant colors from team logos for headers, cards, and backgrounds, adapting to light and dark themes. Supports various league logo naming conventions. Colors are cached locally.
    -   **League Page Branded Background & Accent Colors**: Extracts dominant colors from league banner images to apply gradient backgrounds, section highlights, and accent colors throughout league pages. Manual color overrides are supported.
-   **Technical Implementations**:
    -   **Authentication**: Supabase handles user authentication and session management.
    -   **Routing**: `Wouter` is used for client-side routing.
    -   **Data Display**: Interactive tables for league standings with detailed statistics and animated team performance trends.
    -   **Content Management**: Administrative interfaces for league owners to upload banners and manage team logos.
    -   **Search & Filtering**: Comprehensive search for players and leagues with filtering capabilities.
    -   **Coaching Tools**: Coaches Hub with an integrated League Assistant (chatbot) and document editing for scouting reports.
-   **Feature Specifications**:
    -   **League Management**: Centralized route (`/league-admin/:slug`) for owners to manage assets and integrations.
    -   **Team Pages**: Dedicated pages for league teams (`/league/:slug/teams`) and individual team profiles (`/team/:teamName`).
    -   **Player Profiles**: Individual player pages (`/player/[slug]`) AND inline player profiles within league pages. Clicking a player name on any league tab (Player Stats, Leaders, Overview) opens their profile inline as a new section within the league page — the banner, game carousel, and navigation tabs remain visible. A "Back" button returns to the previous section. The `InlinePlayerProfile` component (`client/src/components/InlinePlayerProfile.tsx`) adapts to the league's brand colors. Includes fuzzy matching to consolidate duplicate player records across competitions.
    -   **Game Results**: Redesigned section with horizontal scrolling ticker and detailed game view modals showing team-filtered box scores.
    -   **Statistical Leaderboards**: Displays top players across multiple statistical categories (`/league-leaders/[slug]`).
    -   **Parent League Aggregation**: Parent leagues (e.g., REBA SL) that have child age-group sub-leagues automatically aggregate data from all children. A pill-style age group tab bar allows filtering all sections (standings, player stats, schedule, top performers) by age group. Standings are displayed as independent tables per age group.
    -   **Player Statistics Table**: Comprehensive, sortable table with 25 columns, search filtering, and mobile-responsive design.
    -   **Team Statistics Table**: Comprehensive table with 27 columns including advanced metrics, and mobile-responsive design.

**Embeddable Widget System**
-   **Widget Builder**: A protected page (`/api-widgets`) provides a form-based editor with live iframe preview and embed code generation.
-   **Widget Types**: Includes League Standings, Player Stats Card, Game Scores, and League Leaders widgets.
-   **Widget Routes**: Public, chromeless pages (`/widget/:type`) accepting URL query parameters for data and visual customization.
-   **Customization Options**: Allows customization of colors, font family, border radius, layout presets, and dimensions.

**SEO Implementation**
-   **Dynamic Sitemap**: Automated sitemap generation (`scripts/generate-sitemap.ts`) from Supabase data, served at `/sitemap.xml`.
-   **Robots.txt**: Configured to allow crawling while blocking sensitive routes and includes sitemap reference.
-   **Meta Tags**: Comprehensive meta tag implementation across all pages, including dynamic descriptions, Open Graph tags, canonical links, and Twitter cards for league, team, and player pages.
-   **Editable SEO Descriptions**: League owners can add/edit custom descriptions for leagues and teams, used in page content and meta tags.
-   **URL Structure**: SEO-friendly URLs for leagues (`/league/[slug]`), teams (`/league/[leagueSlug]/team/[teamName]`), and players (`/player/[slug]`).

**Database Views & Schema Routing**
The application utilizes Supabase database views to simplify data fetching:
-   `v_game_results` for game scores and status (used by league page schedule + `GameResultsCarousel`).
-   `v_game_detail` for comprehensive single-row game details (used by `GameDetailModal`).
-   `v_box_score` for player statistics with resolved names (used by `GameDetailModal`).
-   Views exist in both `public` and `test` schemas; the correct schema client is selected via `getSupabaseForLeague(slug)` and `getDataLeagueId(slug, leagueId)` from `client/src/lib/supabase.ts`.
-   `TEST_SCHEMA_LEAGUES` in `supabase.ts` maps league slugs/IDs to test schema configs.
-   Public schema is always used for: `leagues`, `teams`, `players`, `live_events`, `auth`, `storage`.

**Server Architecture**
-   **Primary server**: `tsx server/index.ts` (Express with Vite) handles API routes and serves the React frontend on port 5000.
-   **League AI chatbot**: Handled directly in `server/routes.ts` using the OpenAI Node SDK.
-   **Python Backend** (optional, port 8000): Handles a secondary coaching chatbot and player scouting analysis, proxied via `proxyToPython` in `server/routes.ts`.

## External Dependencies
-   **Supabase**: Database, user authentication, and object storage for assets like team logos and league banners.
-   **OpenAI (Node SDK)**: Integrated directly into the Express backend for the league chatbot.
-   **Python Flask Backend**: Used for coaching chatbot and player scouting analysis.
-   **Instagram**: Enhanced carousel integration for displaying Instagram posts and reels on league pages, with auto-scrolling, navigation controls, and video playback.