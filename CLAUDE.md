# Last Man Standing - Claude Context File

## Project Overview
A Premier League "Last Man Standing" game where players pick a team each week. If their team loses, they're eliminated. The last player remaining wins.

## Architecture

### Backend: PocketBase
- **Hosting**: PocketHost ($5/month) - https://last-man-chicago.pockethost.io
- **Database**: SQLite with real-time sync
- **Authentication**: JWT tokens with admin/user roles

### Frontend: React + Vite  
- **Hosting**: Vercel (free tier) with automatic deployments from GitHub
- **Routing**: React Router with client-side routing
- **API Integration**: Premier League data from TheSportsDB API

### Collections Schema

#### users
- `first_name`, `last_name`: User display names
- `email`: Login credential  
- `isAdmin`: Boolean for admin privileges

#### teams  
- `team_name`: Full team name (e.g., "Arsenal")
- `team_short_name`: Abbreviation (e.g., "ARS")
- Contains all 20 Premier League teams for 2025/26 season

#### picks
- `user_id`: Reference to user
- `team_id`: Reference to selected team  
- `week_number`: Game week (starts from Week 3 for current season)
- Auto-created by system if user doesn't pick

#### deadlines
- `week_number`: Game week
- `deadline_date`, `deadline_time`: When picks close
- `status`: active/closed
- Auto-calculated as 6 hours before first match of the week

#### winning_teams
- `week_number`: Game week
- `team_id`: Reference to winning team
- Multiple winners per week (teams that won their matches)

## Key Features

### Auto-Assignment System
- When a new week starts, every user automatically gets the first available team alphabetically
- Week 1 → Everyone gets Aston Villa (if available)  
- Later weeks → Users get their first unused team alphabetically
- Users can change their pick before the deadline

### Elimination Logic  
- Checks previous weeks to determine if user is eliminated
- Skips weeks with no declared winners (unplayed weeks)
- Users eliminated if: no pick for a week OR their team lost

### Admin Privileges
- **User Management**: Create accounts for players
- **Winner Marking**: Manual selection + API auto-fill from match results  
- **Game Reset**: Start new seasons from any week
- **Current Picks Viewing**: See all player picks before deadline in "All Players Picks History"

### User Experience
- **Real-time Match Display**: Shows fixtures when making picks
- **Deadline Enforcement**: Blocks picks after deadline with visual feedback
- **Pick History**: Beautiful card layout showing past selections
- **Mobile Responsive**: Works on all devices
- **Elimination Page**: Encouraging messages for eliminated players

## Technical Implementation

### Game Logic (src/utils/gameLogic.js)
- `getMatchWinner()`: Determines match winner from API data
- `getFirstAvailableTeam()`: Auto-assignment logic  
- `checkUserElimination()`: Elimination status checking
- Full test coverage with 16 unit tests

### Components
- **Login.jsx**: Authentication with dark text styling
- **PickTeam.jsx**: Main game interface with auto-assignment  
- **MyPicks.jsx**: User's pick history (no dates, just week + team)
- **Admin.jsx**: Admin dashboard with all management tools
- **AllPlayersPicksHistory.jsx**: Admin can see current picks, users see only past

### API Integration
- TheSportsDB API for Premier League fixture and result data
- Auto-fill winners when matches finish  
- Team name mapping between API and database

## Deployment

### Backend (PocketHost)
1. Account created at pockethost.io ($5/month)
2. Database URL: https://last-man-chicago.pockethost.io
3. Collections and fields configured manually through admin UI
4. Teams populated using `setup_teams.js` script

### Frontend (Vercel)  
1. Connected to GitHub repository: https://github.com/bajcula/last-man-standing  
2. Root directory set to `frontend` in Vercel settings
3. Environment variable: `VITE_POCKETBASE_URL=https://last-man-chicago.pockethost.io`
4. Build command: `npm install && npm run build`
5. Output directory: `dist`

### Environment Variables (.env in root)
```
ADMIN_EMAIL=your-admin-email
ADMIN_PASSWORD=your-admin-password  
POCKETBASE_URL=https://last-man-chicago.pockethost.io
```

## Development Workflow

### Local Development
```bash
# Backend (if running locally)
cd pocketbase && ./pocketbase serve

# Frontend  
cd frontend && npm run dev
```

### Testing
```bash
cd frontend && npm test  # Runs 16 unit tests with Vitest
```

### Deployment
Push to `main` branch on GitHub → Vercel auto-deploys frontend
PocketHost backend is always live at the hosted URL

## Game Flow

### Season Setup (Admin)
1. Ensure teams are populated (use `repopulate_teams.js` if needed)
2. Create user accounts for all players
3. Game automatically detects current week from deadlines
4. First deadline auto-calculated 6 hours before first match

### Weekly Process
1. **Auto-Assignment**: All users get first available team automatically
2. **User Picks**: Players can change their pick before deadline  
3. **Match Day**: Games are played, results come in
4. **Winner Marking**: Admin marks winners (manual + API auto-fill)
5. **Elimination**: System automatically eliminates users with losing teams
6. **Next Week**: Process repeats

### Admin Tasks
- **Mark Winners**: After matches finish each week
- **Monitor Picks**: View current participation in "All Players Picks History"
- **User Management**: Add new players or check status

## Current Season Status
- **Active Week**: Week 3 (2025/26 season)  
- **Previous Weeks**: 1-2 not played (no winners declared, skipped in elimination)
- **Auto-Assignment**: Working correctly for Week 3
- **All Systems**: Fully operational

## Troubleshooting

### Common Issues
1. **Auto-picks appearing for unplayed weeks**: Delete winning_teams entries for those weeks
2. **Invalid Date in pick history**: Fixed by removing date display entirely  
3. **Elimination for unplayed weeks**: System skips weeks with no declared winners
4. **Vercel 404 on refresh**: Fixed with vercel.json rewrites configuration

### Database Scripts  
- `setup_teams.js`: Initial team population  
- `repopulate_teams.js`: Update team data if needed

### Key Code Locations
- Auto-assignment: `frontend/src/components/PickTeam.jsx:118-153`
- Elimination logic: `frontend/src/components/PickTeam.jsx:155-210`  
- Admin privileges: `frontend/src/components/AllPlayersPicksHistory.jsx:89-108`
- Game logic tests: `frontend/src/utils/gameLogic.test.js`

## Performance & Scalability
- **Tested for**: 50+ users, 38 weeks, 1000+ picks
- **Free tier limits**: Sufficient for most friend groups  
- **Response time**: Fast queries with PocketBase SQLite
- **Mobile performance**: Optimized for all devices

## Security
- **Authentication**: Encrypted JWT tokens
- **Role-based access**: Admin vs player permissions  
- **API validation**: Server-side input validation
- **HTTPS**: Enforced in production
- **Data privacy**: Picks hidden until deadlines (except for admins)

The application is production-ready and fully functional for Premier League Last Man Standing competitions.