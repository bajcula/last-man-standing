# Frontend Commands

## Development
- `npm run dev` - Start development server (Vite)
- `npm install` - Install dependencies

## Build & Deploy
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally

## Code Quality
- `npm run lint` - Run ESLint

## Dependencies
- React 19.1.1
- React Router DOM 7.8.2
- Axios (HTTP client)
- PocketBase (backend client)
- Vite (build tool)

## Project Structure
- `src/App.jsx` - Main application component
- `src/components/` - React components (Login, Admin, PickTeam, etc.)
- `src/lib/pocketbase.js` - PocketBase client setup
- `public/` - Static assets
- `index.html` - Entry HTML file

## Deployment Configuration

### Vercel Settings
- **Root Directory**: Set to `frontend` in Vercel dashboard
- **Build Command**: `npm install && npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`
- **Environment Variables**: 
  - `VITE_POCKETBASE_URL=https://last-man-chicago.pockethost.io`

### Important Notes:
- The `vercel.json` file should NOT include `cd frontend` commands since the root directory is already set to `frontend` in Vercel settings
- If you see "ENOENT: no such file or directory" errors, check that the root directory in Vercel is set correctly
- Backend is deployed separately on PocketHost ($5/month plan required for live instances)