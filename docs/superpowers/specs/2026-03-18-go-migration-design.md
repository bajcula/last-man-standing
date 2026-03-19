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
├── go.mod / go.sum           # Go module (github.com/bajcula/last-man-standing/backend)
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
| `services/` | HTTP client for TheSportsDB, response parsing, team name lookup | net/http, encoding/json |
| `gamelogic/` | Pure functions: no DB, no HTTP, just inputs → outputs | none (stdlib only) |
| `migrations/` | Schema creation and seed data | pocketbase/core, pocketbase/migrations |

### Why This Structure

- **`gamelogic/` is pure**: `GetMatchWinner(homeScore, awayScore)`, `IsUserEliminated(picks, winners, week)`, `GetFirstAvailableTeam(usedTeams, allTeams)` take plain data and return plain data. No mocking needed for tests.
- **`services/` isolates external I/O**: TheSportsDB API calls are in one place. Can be mocked at the package boundary for integration tests.
- **`hooks/` is the glue**: orchestrates the flow but delegates all logic. Thin layer.

## Collections Schema (Final Form)

All collections created in a single migration (`001_schema.go`). Access rules for all collections (list, view, create, update, delete) set to `""` (allow all operations) — matches current JS migration behavior.

Migration skeleton using PocketBase v0.36 API:

```go
package migrations

import (
    "github.com/pocketbase/pocketbase/core"
    m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
    m.Register(func(app core.App) error {
        collection := core.NewBaseCollection("teams")
        collection.ListRule = nil  // or types.Pointer("")
        collection.Fields.Add(
            &core.TextField{Name: "team_name", Required: true},
            &core.TextField{Name: "team_short_name", Required: true},
        )
        return app.Save(collection)
    }, func(app core.App) error {
        collection, _ := app.FindCollectionByNameOrId("teams")
        return app.Delete(collection)
    })
}
```

### teams (base collection)
| Field | Type | Notes |
|-------|------|-------|
| team_name | text, required | Full API name, e.g. "Wolverhampton Wanderers" |
| team_short_name | text, required | 3-letter code, e.g. "WOL" |

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

Note: CLAUDE.md describes `deadline_date` + `deadline_time` as separate fields with a `status` field. This is stale — the actual DB uses `deadline_time` (date) and `is_closed` (bool). CLAUDE.md will be updated after migration.

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

## Seed Data (002_seed_teams.go)

20 Premier League teams matching the current production database exactly (from `pocketbase/pb_migrations/1756200000_seed_teams.js`):

| team_name | team_short_name |
|-----------|----------------|
| Arsenal | ARS |
| Aston Villa | AVL |
| Bournemouth | BOU |
| Brentford | BRE |
| Brighton and Hove Albion | BHA |
| Burnley | BUR |
| Chelsea | CHE |
| Crystal Palace | CRY |
| Everton | EVE |
| Fulham | FUL |
| Leeds United | LEE |
| Liverpool | LIV |
| Manchester City | MCI |
| Manchester United | MUN |
| Newcastle United | NEW |
| Nottingham Forest | NFO |
| Sunderland | SUN |
| Tottenham Hotspur | TOT |
| West Ham United | WHU |
| Wolverhampton Wanderers | WOL |

Seed migration skips insertion if teams already exist (idempotent), matching current JS behavior.

## Game Logic Functions (gamelogic/)

All pure functions — no side effects, no DB calls.

### GetMatchWinner(homeTeam, awayTeam string, homeScore, awayScore int, status string) string
Returns:
- Winning team name if one team has more goals
- `"Draw"` if scores are equal and match is finished
- `""` (empty string) if match is not finished

This matches the JS behavior where `markWinners` checks `wn === "Draw"` to skip draws and `!wn` to skip unfinished matches.

### IsUserEliminated(userPicks []Pick, allWinners []Winner, currentWeek int) bool
Checks all previous weeks (1 to currentWeek-1). Skips weeks with no declared winners (unplayed weeks). User is eliminated if: no pick for a played week, or their picked team is not in that week's winners.

### GetFirstAvailableTeam(usedTeamIDs []string, allTeams []Team) *Team
Returns first team alphabetically (by team_name) whose ID is not in usedTeamIDs. Returns nil if all teams used.

### GetCurrentSeason() string
Derives season string from current date. Month >= August → current year is start year. Otherwise previous year. Returns e.g. "2025-2026".

### CalculateDeadline(matches []Match, now time.Time) time.Time
Finds earliest future match kickoff (skipping past and postponed matches), subtracts 2-hour buffer. Falls back to 7 days from now at 12:00 UTC if no future matches found.

Note: The backend uses a 2-hour buffer (`DEADLINE_BUFFER_HOURS = 2`). The frontend's `calculateDeadlineFromMatches` uses 6 hours. The backend-created deadline record is authoritative — the frontend reads it from the `deadlines` collection, so the frontend's local calculation is only used as a display fallback.

## TheSportsDB Client (services/)

### Constants
```go
const (
    LeagueID           = "4328"        // English Premier League
    APIBase            = "https://www.thesportsdb.com/api/v1/json/3"
    APITimeout         = 30 * time.Second
    DeadlineBufferHrs  = 2
    ResultsBufferHrs   = 5
    StartWeek          = 30
)
```

### Types
```go
type Match struct {
    HomeTeam    string `json:"strHomeTeam"`
    AwayTeam    string `json:"strAwayTeam"`
    HomeScore   string `json:"intHomeScore"`   // string from API, parsed to int
    AwayScore   string `json:"intAwayScore"`   // string from API, parsed to int
    Status      string `json:"strStatus"`      // "Match Finished", "Not Started", "Postponed", etc.
    DateEvent   string `json:"dateEvent"`      // "2026-03-20"
    StrTime     string `json:"strTime"`        // "15:00:00"
    Postponed   string `json:"strPostponed"`   // "yes" or ""
}

type RoundResponse struct {
    Events []Match `json:"events"`
}
```

### FetchRoundMatches(season string, round int) ([]Match, error)
- HTTP GET to `{APIBase}/eventsround.php?id={LeagueID}&r={round}&s={season}`
- 30-second timeout (matching JS hook's `$http.send` timeout)
- Parses JSON response into typed structs
- Returns `events` array or empty slice if `events` is null

### FindTeamByApiName(apiName string, teams []Team) *Team
3-tier team lookup matching JS behavior:
1. Check `TeamNameMap` for alternate name → find mapped canonical name in teams
2. Exact match on `team_name`
3. Partial/fuzzy match: team_name contains apiName, or apiName contains first word of team_name

### TeamNameMap
```go
var TeamNameMap = map[string]string{
    "Man United":   "Manchester United",
    "Man City":     "Manchester City",
    "Newcastle":    "Newcastle United",
    "West Ham":     "West Ham United",
    "Tottenham":    "Tottenham Hotspur",
    "Spurs":        "Tottenham Hotspur",
    "Leicester":    "Leicester City",
    "Wolves":       "Wolverhampton Wanderers",
    "Wolverhampton":"Wolverhampton Wanderers",
    "Nottm Forest": "Nottingham Forest",
    "Brighton":     "Brighton and Hove Albion",
    "Nott'm Forest":"Nottingham Forest",
}
```

### Skip Statuses
Matches with these statuses are treated as "resolved" (don't block gameweek completion):
- `"Postponed"`, `"Cancelled"`, `"Abandoned"`, `"Awarded"`

### GetPollingWindow(matches []Match, now time.Time) (active bool, reason string)
Determines if the cron should actively poll for results:
- Skips postponed/cancelled matches when calculating window
- Window: first kickoff → last kickoff + `ResultsBufferHrs` (5 hours)
- Returns inactive with reason if before first kickoff or after results window

## Cron Hook (hooks/)

### RegisterGameweekCron(app core.App)
Registers cron job via `app.Cron().MustAdd("gameweek-automation", "*/30 * * * *", handler)`.

Note: The JS hook runs every minute (`* * * * *`) for testing convenience. Production uses 30-minute intervals — sufficient since matches last 90+ minutes and results don't change between polls during non-match times.

### Handler Flow

**First-run bootstrap** (no deadlines exist in DB):
1. Log `[AUTOMATION] First run - initializing at week {StartWeek}`
2. Create deadline for StartWeek
3. Auto-assign picks for StartWeek
4. Return early

**Normal flow** (deadlines exist):
1. Get current week from deadlines collection (highest week_number)
2. If week already has winners → ensure next week ready (deadline + auto-assign), return
3. Fetch matches from TheSportsDB for current round
4. If no matches → log and return
5. Count finished, skipped (postponed/cancelled/etc.), and pending matches
6. If all resolved (finished + skipped, none pending): mark winners, ensure next week ready
7. If not all resolved: check polling window
   - Outside window → log reason and return
   - Inside window → log progress and return (will check again next tick)
8. All actions wrapped in try/catch with `[AUTOMATION]` prefixed logging

### DB Operations (within hooks/)
- `getCurrentWeek(app)` — query deadlines, sort by -week_number, return highest
- `weekAlreadyProcessed(app, week)` — check if winning_teams exist for this week
- `markWinners(app, week, matches)` — for each finished match with a winner, find team in DB, create winning_teams record (idempotent — skip if already exists)
- `createDeadline(app, week)` — fetch next week's matches, calculate deadline, save to deadlines (idempotent)
- `autoAssignPicks(app, week)` — for each non-eliminated user without a pick, assign first available team alphabetically
- `ensureNextWeekReady(app, currentWeek)` — create deadline + auto-assign for currentWeek+1

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

Note on `CGO_ENABLED=0`: PocketBase v0.36 uses `modernc.org/sqlite`, a pure Go SQLite implementation that does not require CGO. This is safe.

Note on Go version: PocketBase v0.36.7 requires Go 1.25.0 per its go.mod. Go 1.25 was released Aug 2025.

Note on dev workflow: Unlike JS hooks which hot-reload via volume mount, Go hooks are compiled into the binary. Changes require rebuilding the Docker image (`docker compose build pocketbase`).

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
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "backend/Dockerfile",
    "watchPatterns": ["backend/**"]
  },
  "deploy": {
    "startCommand": "/pb/pocketbase serve --http=0.0.0.0:$PORT",
    "healthcheckPath": "/api/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### Superuser Creation
PocketBase v0.36 manages superusers through the `_superusers` system collection. On first run of a fresh Railway deployment, create the initial superuser via:
```bash
./pocketbase superuser create admin@example.com yourpassword
```
Or via the `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars if PocketBase supports auto-creation. This needs to be verified during implementation and documented in `.env.example`.

## Testing Strategy

### Unit Tests (gamelogic/)
Port and expand existing 16 test cases:
- `TestGetMatchWinner` — home win, away win, draw, zero-zero, not finished
- `TestIsUserEliminated` — eliminated, survived, skipped weeks (no winners), no pick for played week
- `TestGetFirstAvailableTeam` — first pick, mid-season, all used, nil return
- `TestGetCurrentSeason` — before Aug, after Aug, boundary (July 31 vs Aug 1)
- `TestCalculateDeadline` — normal, past matches skipped, postponed skipped, all-past fallback

### Service Tests (services/)
- `TestParseMatchResponse` — valid JSON, empty events, null events, malformed
- `TestFindTeamByApiName` — mapped name, exact match, partial match, not found
- `TestTeamNameMapping` — all known alternates resolve correctly

### Integration Test
- Start test PocketBase app with migrations
- Run cron handler with mocked HTTP responses
- Verify winners marked, deadlines created, picks auto-assigned

## Migration Path

1. Build and validate Go backend locally with Docker
2. Run frontend against Go backend — verify all flows work
3. Deploy Go backend to Railway
4. Create superuser on Railway instance
5. Point frontend env var to Railway URL
6. Verify production works end-to-end
7. Remove old `pocketbase/` directory
8. Update CLAUDE.md (fix stale deadline field names, hosting info, dev workflow)

## Out of Scope

- Frontend changes (none needed)
- Schema changes (identical collections)
- New features (pure port)
- Production data migration from PocketHost (separate step after validation)
- Season team list updates (same teams as current seed — update separately if needed)

## Risks

- **PocketBase 0.22 → 0.36 API differences**: Collection creation API changed significantly (Schema → Fields, Dao → App methods). Mitigated by using context7 docs and migration skeleton above.
- **Data migration**: Existing PocketHost data needs to be exported/imported to Railway PocketBase. Not covered in this phase — production cutover is a separate step.
- **TheSportsDB API quirks**: Same edge cases as JS version. Porting the exact same logic and team name map.
- **Superuser management**: PocketBase v0.36 changed how superusers work. Need to verify creation method during implementation.
