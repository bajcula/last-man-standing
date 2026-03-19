# Phase 7: Backend Go Migration — Design Spec

## Overview

Replace the pre-built PocketBase binary + JS hooks (`pocketbase/`) with a custom Go PocketBase app (`backend/`). The frontend is unchanged — same REST API, same collections, same schema.

## Motivation

- Type safety: Go catches errors at compile time that JS hooks surface at runtime
- Single-language backend: Go instead of JS-in-Go-VM (JSVM)
- Testability: pure game logic functions with proper unit tests
- PocketBase v0.36.7: latest version with bug fixes, security patches, and SQLite 3.51.3
- Deployment: Railway supports custom Go builds; enables future infrastructure flexibility

## Current State

- **Backend**: Pre-built PocketBase 0.22.22 binary with JS hooks (`pocketbase/pb_hooks/gameweek_automation.pb.js`, 302 lines)
- **Migrations**: 12 JS migration files (635 lines total) that incrementally built the schema
- **Deployment**: PocketHost ($5/mo) for production, Docker for local dev
- **Frontend**: React + TypeScript on Vercel (no changes needed)

## Target State

- **Backend**: Custom Go PocketBase 0.36.7 app in `backend/`
- **Migrations**: 2 consolidated Go migrations (final schema + seed data)
- **Deployment**: Railway for Go backend, Docker for local dev
- **Frontend**: Unchanged

## Architecture

```
backend/
├── main.go                   # PocketBase app entry point, cron + migration registration
├── go.mod / go.sum           # Go module (pocketbase v0.36.7, Go 1.25+)
├── Dockerfile                # Multi-stage build: Go compile → Alpine runtime
├── hooks/
│   └── gameweek.go           # Cron job: orchestrates weekly automation
├── services/
│   └── sportsdb.go           # TheSportsDB API client with typed responses
├── gamelogic/
│   └── gamelogic.go          # Pure functions: match winner, elimination, auto-assign
│   └── gamelogic_test.go     # Unit tests
└── migrations/
    ├── 001_schema.go         # All collections in final form
    └── 002_seed_teams.go     # 20 Premier League teams
```

### Separation of Concerns

| Package | Responsibility | Dependencies |
|---------|---------------|-------------|
| `main.go` | App bootstrap, cron registration, migration loading | pocketbase, hooks, migrations |
| `hooks/` | Cron handler: DB queries → game logic → DB writes | services, gamelogic, pocketbase/core |
| `services/` | HTTP client for TheSportsDB, response parsing, team name mapping | net/http, encoding/json |
| `gamelogic/` | Pure functions: no DB, no HTTP, just inputs → outputs | none (stdlib only) |
| `migrations/` | Schema creation and seed data | pocketbase/core, pocketbase/migrations |

### Why This Structure

- **`gamelogic/` is pure**: `GetMatchWinner(homeScore, awayScore)`, `IsUserEliminated(picks, winners, week)`, `GetFirstAvailableTeam(usedTeams, allTeams)` take plain data and return plain data. No mocking needed for tests.
- **`services/` isolates external I/O**: TheSportsDB API calls are in one place. Can be mocked at the package boundary for integration tests.
- **`hooks/` is the glue**: orchestrates the flow but delegates all logic. Thin layer.

## Collections Schema (Final Form)

All collections created in a single migration (`001_schema.go`):

### teams (base collection)
| Field | Type | Notes |
|-------|------|-------|
| team_name | text | Full API name, e.g. "Wolverhampton Wanderers" |
| team_short_name | text | 3-letter code, e.g. "WOL" |

### picks (base collection)
| Field | Type | Notes |
|-------|------|-------|
| user_id | relation → users | |
| team_id | relation → teams | |
| week_number | number | |

### deadlines (base collection)
| Field | Type | Notes |
|-------|------|-------|
| week_number | number | |
| deadline_time | date | ISO 8601 UTC |
| is_closed | bool | |

### winning_teams (base collection)
| Field | Type | Notes |
|-------|------|-------|
| week_number | number | |
| team_id | relation → teams | |

### users (auth collection, built-in)
| Field | Type | Notes |
|-------|------|-------|
| first_name | text | Added to default auth |
| last_name | text | Added to default auth |
| isAdmin | bool | |

Access rules: set to empty string (allow all operations) — matches current JS migration behavior.

## Seed Data (002_seed_teams.go)

20 Premier League 2025/26 teams with exact TheSportsDB API names:

| team_name | team_short_name |
|-----------|----------------|
| Arsenal | ARS |
| Aston Villa | AVL |
| AFC Bournemouth | BOU |
| Brentford | BRE |
| Brighton and Hove Albion | BHA |
| Chelsea | CHE |
| Crystal Palace | CRY |
| Everton | EVE |
| Fulham | FUL |
| Ipswich Town | IPS |
| Leicester City | LEI |
| Liverpool | LIV |
| Manchester City | MCI |
| Manchester United | MUN |
| Newcastle United | NEW |
| Nottingham Forest | NFO |
| Southampton | SOU |
| Tottenham Hotspur | TOT |
| West Ham United | WHU |
| Wolverhampton Wanderers | WOL |

## Game Logic Functions (gamelogic/)

All pure functions — no side effects, no DB calls.

### GetMatchWinner(homeTeam, awayTeam string, homeScore, awayScore int) string
Returns winning team name, or "" for draw.

### IsUserEliminated(userPicks []Pick, allWinners []Winner, currentWeek int) bool
Checks all previous weeks. Skips weeks with no declared winners. User is eliminated if their picked team is not in that week's winners.

### GetFirstAvailableTeam(usedTeams []string, allTeams []string) string
Returns first team alphabetically that hasn't been used. Used for auto-assignment.

### GetCurrentSeason() string
Derives season string from current date. Aug+ = new season year (e.g., "2025-2026").

### CalculateDeadline(matches []Match, now time.Time) time.Time
Finds earliest future match kickoff, subtracts buffer (2 hours). Skips past matches and postponed matches.

## TheSportsDB Client (services/)

### Types
```go
type Match struct {
    HomeTeam    string
    AwayTeam    string
    HomeScore   int
    AwayScore   int
    Status      string    // "Match Finished", "Not Started", "Postponed", etc.
    DateEvent   string    // "2026-03-20"
    StrTime     string    // "15:00:00"
    Postponed   string    // "yes" or ""
}
```

### FetchRoundMatches(season string, round int) ([]Match, error)
- HTTP GET to TheSportsDB API with 10-second timeout
- Parses JSON response into typed structs
- Returns parsed matches or error

### TeamNameMap
Maps API alternate names to canonical DB names. Only needed for edge cases where TheSportsDB returns inconsistent names.

### Skip Statuses
Matches with these statuses are treated as "resolved" (don't block gameweek completion):
- "Postponed", "Cancelled", "Abandoned", "Awarded"

## Cron Hook (hooks/)

### RegisterGameweekCron(app core.App)
Registers cron job via `app.Cron().MustAdd("gameweek-automation", "*/30 * * * *", handler)`.

### Handler Flow (same logic as current JS hook)
1. Get current week from deadlines collection
2. Check if week already has winners → skip if so
3. Fetch matches from TheSportsDB for current round
4. Check polling window (only poll during match days ± buffer)
5. Check if all matches resolved (finished + skipped statuses)
6. If complete: mark winners, ensure next week ready (deadline + auto-assign)
7. Log all actions with `[AUTOMATION]` prefix

## Infrastructure

### backend/Dockerfile
```dockerfile
# Build stage
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o pocketbase .

# Runtime stage
FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/pocketbase /pb/pocketbase
EXPOSE 8090
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
```

### docker-compose.yml (updated)
```yaml
services:
  pocketbase:
    build: ./backend
    ports:
      - "8090:8090"
    volumes:
      - pb_data:/pb/pb_data
  frontend:
    build:
      context: ./frontend
      args:
        VITE_POCKETBASE_URL: http://localhost:8090
    ports:
      - "3000:80"
    depends_on:
      - pocketbase
volumes:
  pb_data:
```

### railway.json (updated)
Updated to build from `backend/` directory. Railway auto-detects Go projects and builds them.

## Testing Strategy

### Unit Tests (gamelogic/)
Port and expand existing 16 test cases:
- `TestGetMatchWinner` — home win, away win, draw, zero-zero
- `TestIsUserEliminated` — eliminated, survived, skipped weeks, no winners
- `TestGetFirstAvailableTeam` — first pick, mid-season, all used
- `TestGetCurrentSeason` — before Aug, after Aug, edge cases
- `TestCalculateDeadline` — normal, past matches skipped, postponed skipped, all past fallback

### Service Tests (services/)
- `TestParseMatchResponse` — valid JSON, empty response, malformed
- `TestTeamNameMapping` — known alternates, unknown names passthrough

### Integration Test
- Start test PocketBase app with migrations
- Run cron handler with mocked HTTP responses
- Verify winners marked, deadlines created, picks auto-assigned

## Migration Path

1. Build and validate Go backend locally with Docker
2. Run frontend against Go backend — verify all flows work
3. Deploy Go backend to Railway
4. Point frontend env var to Railway URL
5. Verify production works end-to-end
6. Remove old `pocketbase/` directory
7. Update `railway.json` for Go build

## Out of Scope

- Frontend changes (none needed)
- Schema changes (identical collections)
- New features (pure port)
- PocketHost migration (Railway replaces it)

## Risks

- **PocketBase 0.22 → 0.36 API differences**: Collection creation API has changed. Mitigated by using context7 docs for current API.
- **Data migration**: Existing PocketHost data needs to be exported/imported to Railway PocketBase. Not covered in this phase — production cutover is a separate step.
- **TheSportsDB API quirks**: Same edge cases as JS version. Porting the exact same logic and team name map.
