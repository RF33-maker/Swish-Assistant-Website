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