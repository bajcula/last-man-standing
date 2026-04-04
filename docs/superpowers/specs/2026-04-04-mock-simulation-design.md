# End-to-End Mock Simulation — Design Spec

## Problem

The app depends on real-time TheSportsDB data. Locally, you can't test the full game cycle (picks → match results → elimination → next week) without waiting for real matches. The current `MockFetcher` only feeds the backend cron with static scenarios — the frontend still calls TheSportsDB directly, and there's no way to advance through weeks.

## Solution

When `MOCK_API=<starting_week>` is set (e.g. `MOCK_API=25`), the backend becomes the single source of truth for all match data:

1. **Stateful MockFetcher** — tracks per-week match state. Each week starts "Not Started" and can be advanced to "Match Finished" with randomized scores.
2. **Match endpoint** — `GET /api/matches/:round` serves fixture data from the fetcher. Frontend calls this instead of TheSportsDB when running locally.
3. **Advance endpoint** — `POST /api/dev/advance` completes the current week with random results, runs the cron cycle (mark winners, create next deadline, auto-assign picks), and returns a summary.
4. **Frontend routing** — `VITE_MOCK_API=true` makes the frontend fetch from the backend instead of TheSportsDB. In production, no env var is set and the frontend calls TheSportsDB directly.

## Architecture

### MOCK_API Env Var (changed)

Previously: `MOCK_API=<scenario_name>` (e.g. `all-finished`)
Now: `MOCK_API=<starting_week>` (e.g. `25`)

The value is a PL round number. The app starts simulating from that week. Invalid values (non-numeric, out of range 1-38) cause a fatal at startup.

### Stateful MockFetcher

```go
type MockFetcher struct {
    mu          sync.Mutex
    startWeek   int
    currentWeek int
    weekStates  map[int][]APIMatch // per-week match data
}
```

- `NewMockFetcher(startWeek int)` initializes the fetcher. Week `startWeek` gets "Not Started" matches with kickoff times set to tomorrow.
- `FetchRoundMatches(season, round)` returns the stored state for that round. Weeks before `startWeek` return empty (they're "in the past"). Weeks at or after `startWeek` that haven't been initialized yet get auto-generated as "Not Started".
- `Advance()` finalizes the current week: random scores for all matches, status set to "Match Finished". Returns the finalized matches. Increments `currentWeek`.

### Random Results

When a week is advanced, each match gets a random outcome:
- ~40% home win (home score 1-4, away score 0 to home-1)
- ~30% away win (away score 1-4, home score 0 to away-1)
- ~30% draw (both teams same score, 0-3)

This produces realistic-enough elimination patterns. Results use a deterministic seed (`week_number`) so restarting the app produces the same results for the same week sequence.

### Fixture Generation

All 10 matches per week use the project's 20 seeded teams in fixed pairings:

```
Arsenal vs Chelsea
Aston Villa vs Bournemouth
Brentford vs Brighton and Hove Albion
Burnley vs Crystal Palace
Everton vs Fulham
Liverpool vs Manchester City
Manchester United vs Newcastle United
Nottingham Forest vs Sunderland
Tottenham Hotspur vs West Ham United
Wolverhampton Wanderers vs Leeds United
```

These are the same pairings every week (simplification — real PL rotates). This is fine for simulation purposes.

### New Endpoints

#### `GET /api/matches/:round`

Registered only when `MOCK_API` is set.

Returns the same JSON shape as TheSportsDB so frontend parsing stays unchanged:

```json
{
  "events": [
    {
      "strHomeTeam": "Arsenal",
      "strAwayTeam": "Chelsea",
      "intHomeScore": null,
      "intAwayScore": null,
      "strStatus": "Not Started",
      "dateEvent": "2026-04-05",
      "strTime": "15:00:00",
      "strPostponed": ""
    }
  ]
}
```

After advance, scores are filled and status becomes "Match Finished".

#### `POST /api/dev/advance`

Registered only when `MOCK_API` is set.

1. Calls `mockFetcher.Advance()` to finalize current week with random scores
2. Runs `runGameweekAutomation(app, fetcher)` to process results
3. Returns summary:

```json
{
  "advanced_week": 25,
  "results": [
    {"home": "Arsenal", "away": "Chelsea", "score": "2-1", "winner": "Arsenal"},
    {"home": "Liverpool", "away": "Manchester City", "score": "1-1", "winner": "Draw"}
  ],
  "next_week": 26
}
```

Returns 404 when `MOCK_API` is not set.

### Frontend Changes

**`frontend/src/utils/api.ts`**

```typescript
export const fetchRoundMatches = async (round: number): Promise<ApiMatch[]> => {
  if (import.meta.env.VITE_MOCK_API) {
    const response = await fetch(`http://localhost:8090/api/matches/${round}`);
    const data = await response.json();
    return (data.events || []) as ApiMatch[];
  }
  // existing TheSportsDB call unchanged
  const season = getCurrentSeason();
  const url = `https://www.thesportsdb.com/api/v1/json/3/eventsround.php?id=${LEAGUE_ID}&r=${round}&s=${season}`;
  // ...
};
```

**`frontend/.env.development`**

```
VITE_MOCK_API=true
```

This file is gitignored or committed as a dev default. When deploying to Vercel, this var is not set, so production uses TheSportsDB directly.

### Startup Flow

```
MOCK_API=25 go run . serve

1. MockFetcher created with startWeek=25, currentWeek=25
2. Week 25 matches generated as "Not Started", kickoff = tomorrow
3. Cron runs on first tick:
   - Finds no deadlines → creates deadline for week 25 (2hrs before kickoff)
   - Auto-assigns picks for all users
4. App is ready. Frontend shows week 25 fixtures via /api/matches/25
```

### Simulation Workflow

```
1. Open UI, log in as different users, make picks
2. curl -X POST http://localhost:8090/api/dev/advance
   → Week 25 finalized with random scores
   → Winners marked, eliminated players flagged
   → Week 26 created with deadline and auto-picks
3. Refresh UI — see results, next week ready
4. Make picks for week 26
5. curl -X POST http://localhost:8090/api/dev/advance
   → Repeat
```

## Files Changed

| Action | File | Purpose |
|--------|------|---------|
| Rewrite | `backend/services/mock.go` | Stateful MockFetcher with per-week state and Advance() |
| Update | `backend/services/mock_test.go` | Tests for stateful behavior, advance, random scores |
| Update | `backend/services/fetcher.go` | Remove old scenario compliance check, keep interface |
| Create | `backend/hooks/dev_routes.go` | GET /api/matches/:round + POST /api/dev/advance |
| Modify | `backend/main.go` | Parse week from MOCK_API, wire dev routes |
| Modify | `frontend/src/utils/api.ts` | Route through backend when VITE_MOCK_API is set |
| Create | `frontend/.env.development` | VITE_MOCK_API=true |
| Update | `CLAUDE.md` | Document new MOCK_API=<week> usage |

## What This Replaces

The existing `MockFetcher` with named scenarios (`all-finished`, `pre-kickoff`, etc.) is replaced entirely. Those static scenarios were useful for unit-testing the cron in isolation but don't support the end-to-end simulation workflow. The new stateful fetcher covers both use cases: it starts as "Not Started" (like `pre-kickoff`) and can be advanced to "Match Finished" (like `all-finished`) — but with actual week progression.

## Out of Scope

- Frontend dev endpoint UI (e.g. an "Advance Week" button in admin panel) — curl is fine for now
- Multiple concurrent simulations
- Configurable result distributions
- Real PL fixture rotation (same pairings every week is fine)
