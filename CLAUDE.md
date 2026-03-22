# Last Man Standing

Premier League "Last Man Standing" game for me and my friends. Pick a team each week — if your team loses, you're out. Last one standing wins.

## Architecture

- **Backend**: Custom Go PocketBase v0.36.7 app in `backend/` — Railway (~$5/month)
- **Frontend**: React + Vite in `frontend/` — Vercel (free)
- **API**: TheSportsDB for fixtures and results

## Collections

- **users**: `first_name`, `last_name`, `email`, `isAdmin`
- **teams**: `team_name`, `team_short_name` (20 PL teams)
- **picks**: `user_id`, `team_id`, `week_number` (auto-created if user doesn't pick)
- **deadlines**: `week_number`, `deadline_time`, `is_closed` (2hrs before first match)
- **winning_teams**: `week_number`, `team_id` (multiple per week)

## Game Rules

- Each week, everyone auto-gets the first unused team alphabetically
- Players can change their pick before the deadline
- After matches: teams that won are marked as winners
- No pick or losing team = eliminated. Weeks with no winners are skipped.
- Cron job (`backend/hooks/gameweek.go`) automates: deadlines, auto-picks, winner marking, week progression

## Dev Commands

```bash
cd backend && go run . serve       # Run backend locally
cd frontend && npm run dev         # Run frontend locally
cd backend && go test ./...        # 53 Go tests
cd frontend && npm test            # 16 frontend tests
```

## Mock API for Local Development

Set `MOCK_API` env var to a scenario name to use canned match data instead of hitting TheSportsDB:

```bash
cd backend && MOCK_API=all-finished go run . serve
```

Available scenarios:
- `all-finished` — all 10 matches finished with clear winners
- `pre-kickoff` — all matches not started, deadline tomorrow
- `mid-week` — 5 finished, 5 not started
- `all-draws` — all matches end 1-1 (no winners)
- `with-postponed` — 8 finished, 2 postponed

Without `MOCK_API`, the app calls the real TheSportsDB API as normal.

## Deploy

Push to `main` auto-deploys both: Vercel (frontend) + Railway (backend via `backend/Dockerfile`).

## Key Files

- `backend/main.go` — entry point, wires cron + migrations
- `backend/gamelogic/` — pure game logic (no DB, no HTTP), 28 tests
- `backend/services/` — TheSportsDB client + team name mapping, 25 tests
- `backend/hooks/gameweek.go` — cron automation
- `backend/migrations/` — schema + 20-team seed
- `frontend/src/components/PickTeam.tsx` — main game UI, auto-assignment, elimination
- `frontend/src/components/Admin.tsx` — admin dashboard

## Troubleshooting

- **Auto-picks for unplayed weeks**: Delete winning_teams entries for those weeks
- **Elimination for unplayed weeks**: System skips weeks with no declared winners
- **Vercel 404 on refresh**: Fixed with vercel.json rewrites