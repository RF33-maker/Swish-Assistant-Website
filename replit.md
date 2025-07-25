# React Frontend with Express Backend

## Overview
A professional React and Tailwind CSS website with login functionality and an interactive homepage. This project uses:
- **Frontend**: React with Vite, Tailwind CSS, shadcn/ui components
- **Backend**: Express.js with session-based authentication
- **Database**: In-memory storage (MemStorage)
- **Routing**: Wouter for client-side routing

## Project Architecture

### Frontend Structure
- `client/src/` - React application source
- `client/src/pages/` - Page components
- `client/src/components/` - Reusable components
- `client/src/lib/` - Utility libraries and configurations
- `client/src/hooks/` - Custom React hooks

### Backend Structure
- `server/` - Express.js backend
- `server/routes.ts` - API route definitions
- `server/auth.ts` - Authentication setup
- `server/storage.ts` - Data storage interface
- `shared/schema.ts` - Shared data types between frontend and backend

### Key Features
- Session-based authentication with passport.js
- Protected routes with authentication guards
- Home page with hero section, feature cards, and interactive components
- File upload functionality
- Responsive design with mobile support

## Recent Changes
- **2025-01-25**: Fixed frontend-backend communication issues
  - Removed Supabase configuration
  - Connected frontend to Express backend on port 5000
  - Updated authentication to use local Express auth endpoints
  - Fixed API request routing to use relative paths

## User Preferences
- Use modern React patterns with hooks
- Implement responsive design for all screen sizes
- Focus on clean, professional UI/UX
- Maintain separation between frontend and backend concerns

## Development Setup
- Run `npm run dev` to start both frontend (Vite) and backend (Express) servers
- Backend serves on port 5000 with frontend proxied through Vite
- Authentication endpoints: `/api/login`, `/api/register`, `/api/logout`, `/api/user`