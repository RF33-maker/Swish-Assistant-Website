# React Frontend with Express Backend

## Overview
A professional React and Tailwind CSS website with login functionality and an interactive homepage. This project uses:
- **Frontend**: React with Vite, Tailwind CSS, shadcn/ui components
- **Database**: Supabase for data storage and authentication
- **Backend**: External Python Flask backend (https://sab-backend.onrender.com) for file processing, document parsing, and chatbot
- **Routing**: Wouter for client-side routing

## Project Architecture

### Frontend Structure
- `client/src/` - React application source
- `client/src/pages/` - Page components
- `client/src/components/` - Reusable components
- `client/src/lib/` - Utility libraries and configurations
- `client/src/hooks/` - Custom React hooks

### Backend Integration
- **Supabase**: Database and authentication service
- **Python Flask Backend**: External service for file upload, parsing, and chatbot
- `client/src/lib/supabase.ts` - Supabase client and backend API utilities
- `shared/schema.ts` - Data types for local development

### Key Features
- Supabase authentication integration
- Protected routes with authentication guards
- Home page with hero section, feature cards, and interactive components
- File upload to Supabase storage with Python backend processing
- Document parsing and chatbot functionality via Flask backend
- Responsive design with mobile support

## Recent Changes  
- **2025-02-02**: Created dedicated `/league-admin/:slug` route for centralized league management
  - Built comprehensive LeagueAdmin page consolidating all league owner controls
  - Moved team logo management, banner upload, and Instagram integration to dedicated admin area
  - Created "Open League Admin" button in league sidebar that navigates to `/league-admin/:slug`
  - Centralized all league editing functionality in single admin interface per user request
  - Admin page includes team logo management grid with upload/remove capabilities for all teams
  - Integrated banner management with preview and Instagram URL configuration
  - Added access control ensuring only league owners can access admin functionality
- **2025-02-02**: Implemented comprehensive team logo upload and management system
  - Set up object storage integration for team logo uploads with cloud storage backend
  - Created team_logos database table to store logo assignments by league ID and team name
  - Built TeamLogoUploader component for league owners to upload team logos with file validation (JPG, PNG, GIF, WebP up to 5MB)
  - Developed TeamLogo component that displays logos or fallback placeholders across all platform features
  - Integrated team logos into league standings table, team profile pages, and team listing cards
  - Logos automatically appear in scoreboards, standings, team profiles, and all team-related displays
  - Added upload progress indicators, error handling, and success feedback for logo management
- **2025-02-02**: Implemented Teams navigation tab and dedicated league teams page
  - Changed "Overview" navigation tab to "Teams" in league pages
  - Created `/league/:slug/teams` route accessible via Teams navigation button
  - Built comprehensive LeagueTeams.tsx component displaying all teams for a specific league
  - Added team grid layout with detailed team cards showing statistics, top players, and recent games
  - Maintained separate `/team/:teamName` route for individual team profile pages
  - Teams page shows league header with total teams and games statistics
  - Each team card includes team logo display, roster size, average points, top player highlight, and recent game results
  - Added "View Full Team Profile" buttons linking to individual team pages
  - Kept League Leaders section on main league page for statistical information
- **2025-02-02**: Created dedicated Coaches Hub with integrated chatbot and performance analytics
  - Built new `/coaches-hub` route with authentication-protected access for league owners
  - Moved Team Performance Trends visualizer from public league pages to coaches-only section
  - Integrated LeagueChatbot for quick coaching insights and team performance questions
  - Added league selection, quick stats cards, and coaching tips specifically for team management
  - Created sidebar with coaching assistant chatbot and quick action links
  - Positioned performance analytics as coaching tool rather than general league feature
- **2025-02-02**: Added comprehensive Animated Team Performance Trend Visualizer feature
  - Interactive animated visualization showing team performance trends over time
  - Teams ranked by average points per game with visual trend indicators (up/down/stable)
  - Clickable team cards revealing detailed metrics including games played, total points, best game, and consistency
  - Smooth framer-motion animations with staggered card reveals and interactive sparkline charts
  - Mini sparkline charts showing recent form with color-coded performance trends
  - Calculates team trends by comparing first half vs second half game performance
  - Shows performance insights and explanations for trend calculations
- **2025-02-01**: Successfully implemented league banner upload functionality for league owners
  - League owners can now upload custom banners for their leagues via "Change Banner" button
  - Integrated with Supabase storage using 'league-banners' bucket with proper RLS policies
  - Banner images stored with unique filenames and auto-update league records in real-time
  - Only visible to authenticated league owners with ownership verification
  - Includes upload progress indicator, error handling, and success feedback
  - Feature tested and confirmed working with proper storage permissions
  - Fixed Row Level Security policies to allow public league viewing while maintaining secure banner uploads
  - Resolved frontend code to fetch league data regardless of authentication status for public access
- **2025-02-01**: Redesigned game results section with horizontal scrolling ticker
  - Transformed game results carousel into sports-style horizontal ticker under league banner
  - Added auto-scrolling animation with 30-second continuous loop for seamless viewing
  - Styled with dark background and prominent team scores matching sports broadcast aesthetics
  - Changed "Top Performers" section to "League Leaders" with direct navigation to leaders page
- **2025-02-01**: Added dynamic Instagram integration for league owners
  - League owners can add Instagram profile URLs to show latest posts automatically
  - Supports both profile URLs (auto-updating) and specific post URLs (fixed content)
  - Instagram embed appears in sidebar for all users when configured by league owner
  - URLs stored in database with proper validation and embed URL conversion
- **2025-02-01**: Implemented comprehensive league standings system
  - Automatically calculates team win-loss records from existing game data
  - Shows wins, losses, win percentage, points for/against, and point differential
  - Teams ranked by win percentage with point differential as tiebreaker
  - Visual highlights for top 3 teams (green) and bottom 2 teams (red)
  - Responsive table design with hover effects and detailed statistics
- **2025-02-01**: Enhanced league page with carousel-style game results and team-filtered box scores
  - Replaced AI Game Summary section with interactive game results carousel
  - Created modern carousel component showing recent games with scores and top performers
  - Added detailed game view modal with comprehensive player statistics
  - Implemented team-based filtering in game details following standard box score format
  - Users can now click between teams to view isolated box scores for familiar experience
  - Added team totals row and highlighted game insights for selected team
  - Fixed regex compatibility issues for better cross-browser support
- **2025-01-31**: Added comprehensive League Leaders page with statistical leaderboards
  - Created new dynamic route `/league-leaders/[slug]` for league-specific statistical leaders
  - Built 9 statistical categories: points, rebounds, assists, steals, blocks, FG%, 3P%, FT%, games played
  - Shows top 5 players per category with season averages and totals
  - Added navigation link from league pages to leaders page
  - Implemented clickable player entries that navigate to individual player profiles
  - Fixed team name display and player data aggregation by name+team combination
- **2025-01-31**: Enhanced player search and statistics system with AI analysis and softer color palette
  - Integrated player search into landing page search bar alongside leagues
  - Fixed player stats page routing using proper wouter parameter extraction
  - Added comprehensive player list page at `/players` with search and filtering
  - Connected search results to individual player stats pages at `/player/[id]`
  - Player pages display season averages and game-by-game statistics
  - Changed background styling to white instead of orange gradient per user preference
  - Added playful micro-interactions with hover animations, progress bars, and smooth transitions
  - Enhanced player profile section with profile picture placeholder and trending indicators
  - Implemented AI-powered player analysis using OpenAI API routed through external Python Flask backend
  - Updated entire page color scheme to softer orange tones (orange-50/100/300/400/700/800) for better readability and cohesive design
  - Transformed all card backgrounds from dark/black to clean white backgrounds with soft orange borders (border-orange-200/300)
  - Fixed AI analysis functionality by routing requests to external Flask backend instead of conflicting local Express routes
- **2025-01-25**: Fixed frontend-backend communication issues and restored proper architecture
  - Restored Supabase configuration for database and authentication
  - Connected frontend to external Python Flask backend (https://sab-backend.onrender.com)
  - Added backendApi utilities for file upload, document parsing, and chatbot functionality

## User Preferences
- Use modern React patterns with hooks
- Implement responsive design for all screen sizes
- Focus on clean, professional UI/UX
- Maintain separation between frontend and backend concerns

## Development Setup
- Run `npm run dev` to start the React frontend with Vite on port 3000
- Configure environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_BACKEND_URL
- Frontend connects to Supabase for data and external Python Flask backend for processing
- Authentication handled through Supabase auth service