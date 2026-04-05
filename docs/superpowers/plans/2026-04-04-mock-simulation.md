# End-to-End Mock Simulation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static scenario-based MockFetcher with a stateful one that tracks per-week match state, serves fixtures to the frontend via a new endpoint, and exposes an advance endpoint that completes weeks with random results — enabling full end-to-end game simulation locally.

**Architecture:** Stateful `MockFetcher` holds per-week match data in a map, starting at a configurable week. `MOCK_API=25` starts at week 25. New PocketBase routes (`/api/matches/:round`, `/api/dev/advance`) are registered only in mock mode. Frontend checks `VITE_MOCK_API` to decide whether to fetch from backend or TheSportsDB.

**Tech Stack:** Go 1.25+, PocketBase v0.36.7, React + Vite

**Spec:** `docs/superpowers/specs/2026-04-04-mock-simulation-design.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Rewrite | `backend/services/mock.go` | Stateful MockFetcher with Advance(), random results |
| Rewrite | `backend/services/mock_test.go` | Tests for new stateful MockFetcher |
| Modify | `backend/services/fetcher.go` | Keep interface, remove old MockFetcher compliance check (re-added after rewrite) |
| Create | `backend/hooks/dev_routes.go` | GET /api/matches/:round + POST /api/dev/advance |
| Modify | `backend/hooks/gameweek.go` | Export RunGameweekAutomation so dev_routes can call it |
| Modify | `backend/main.go` | Parse int from MOCK_API, wire dev routes |
| Modify | `frontend/src/utils/api.ts` | Route through backend when VITE_MOCK_API is set |
| Modify | `frontend/.env` | Add VITE_MOCK_API=true for local dev |
| Modify | `CLAUDE.md` | Document new MOCK_API=<week> usage |

---

### Task 1: Rewrite MockFetcher as stateful

**Files:**
- Rewrite: `backend/services/mock.go`
- Rewrite: `backend/services/mock_test.go`

- [ ] **Step 1: Write tests for the new stateful MockFetcher**

Replace `backend/services/mock_test.go` entirely:

```go
package services

import (
	"testing"
)

func TestNewMockFetcher(t *testing.T) {
	mock := NewMockFetcher(25)
	if mock.CurrentWeek() != 25 {
		t.Errorf("expected currentWeek 25, got %d", mock.CurrentWeek())
	}
}

func TestMockFetcher_FetchNotStarted(t *testing.T) {
	mock := NewMockFetcher(25)

	matches, err := mock.FetchRoundMatches("2025-2026", 25)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(matches) != 10 {
		t.Errorf("expected 10 matches, got %d", len(matches))
	}
	for _, m := range matches {
		if m.Status != "Not Started" {
			t.Errorf("expected Not Started, got %q", m.Status)
		}
	}
}

func TestMockFetcher_FetchPastWeek(t *testing.T) {
	mock := NewMockFetcher(25)

	matches, err := mock.FetchRoundMatches("2025-2026", 24)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(matches) != 0 {
		t.Errorf("past weeks should return empty, got %d", len(matches))
	}
}

func TestMockFetcher_FetchFutureWeek(t *testing.T) {
	mock := NewMockFetcher(25)

	matches, err := mock.FetchRoundMatches("2025-2026", 26)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(matches) != 10 {
		t.Errorf("expected 10 matches for future week, got %d", len(matches))
	}
	for _, m := range matches {
		if m.Status != "Not Started" {
			t.Errorf("expected Not Started for future week, got %q", m.Status)
		}
	}
}

func TestMockFetcher_Advance(t *testing.T) {
	mock := NewMockFetcher(25)

	results := mock.Advance()
	if len(results) != 10 {
		t.Fatalf("expected 10 results, got %d", len(results))
	}
	for _, m := range results {
		if m.Status != "Match Finished" {
			t.Errorf("expected Match Finished after advance, got %q", m.Status)
		}
	}

	if mock.CurrentWeek() != 26 {
		t.Errorf("expected currentWeek 26 after advance, got %d", mock.CurrentWeek())
	}

	// Week 25 should now return finished matches
	matches, _ := mock.FetchRoundMatches("2025-2026", 25)
	for _, m := range matches {
		if m.Status != "Match Finished" {
			t.Errorf("week 25 should be finished after advance, got %q", m.Status)
		}
	}

	// Week 26 should be Not Started
	matches, _ = mock.FetchRoundMatches("2025-2026", 26)
	for _, m := range matches {
		if m.Status != "Not Started" {
			t.Errorf("week 26 should be Not Started, got %q", m.Status)
		}
	}
}

func TestMockFetcher_AdvanceMultiple(t *testing.T) {
	mock := NewMockFetcher(25)

	mock.Advance() // 25 done, now at 26
	mock.Advance() // 26 done, now at 27
	mock.Advance() // 27 done, now at 28

	if mock.CurrentWeek() != 28 {
		t.Errorf("expected currentWeek 28, got %d", mock.CurrentWeek())
	}

	// All advanced weeks should be finished
	for week := 25; week <= 27; week++ {
		matches, _ := mock.FetchRoundMatches("2025-2026", week)
		for _, m := range matches {
			if m.Status != "Match Finished" {
				t.Errorf("week %d should be finished, got %q", week, m.Status)
			}
		}
	}
}

func TestMockFetcher_RandomResults(t *testing.T) {
	mock := NewMockFetcher(25)
	results := mock.Advance()

	hasWinner := false
	hasDraw := false
	for _, m := range results {
		hs := ParseScore(m.HomeScore)
		as := ParseScore(m.AwayScore)
		if hs != as {
			hasWinner = true
		} else {
			hasDraw = true
		}
	}
	// With 10 matches and ~30% draw rate, extremely unlikely to have all wins or all draws
	if !hasWinner {
		t.Error("expected at least one non-draw result")
	}
	_ = hasDraw // draws may or may not happen, just checking winners exist
}

func TestMockFetcher_Deterministic(t *testing.T) {
	mock1 := NewMockFetcher(25)
	mock2 := NewMockFetcher(25)

	r1 := mock1.Advance()
	r2 := mock2.Advance()

	for i := range r1 {
		if r1[i].HomeScore != r2[i].HomeScore || r1[i].AwayScore != r2[i].AwayScore {
			t.Errorf("match %d: results differ between runs (%s-%s vs %s-%s)",
				i, r1[i].HomeScore, r1[i].AwayScore, r2[i].HomeScore, r2[i].AwayScore)
		}
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./services/ -run TestMockFetcher -v 2>&1 | head -20`
Expected: Compilation errors — `NewMockFetcher` signature changed.

- [ ] **Step 3: Implement the new stateful MockFetcher**

Replace `backend/services/mock.go` entirely:

```go
package services

import (
	"math/rand"
	"strconv"
	"sync"
	"time"
)

var fixtures = []struct {
	Home string
	Away string
}{
	{"Arsenal", "Chelsea"},
	{"Aston Villa", "Bournemouth"},
	{"Brentford", "Brighton and Hove Albion"},
	{"Burnley", "Crystal Palace"},
	{"Everton", "Fulham"},
	{"Liverpool", "Manchester City"},
	{"Manchester United", "Newcastle United"},
	{"Nottingham Forest", "Sunderland"},
	{"Tottenham Hotspur", "West Ham United"},
	{"Wolverhampton Wanderers", "Leeds United"},
}

// MockFetcher is a stateful mock for end-to-end local simulation.
// Each week starts as "Not Started" and can be advanced to "Match Finished"
// with randomized scores.
type MockFetcher struct {
	mu          sync.Mutex
	startWeek   int
	currentWeek int
	weekStates  map[int][]APIMatch
}

func NewMockFetcher(startWeek int) *MockFetcher {
	return &MockFetcher{
		startWeek:   startWeek,
		currentWeek: startWeek,
		weekStates:  make(map[int][]APIMatch),
	}
}

func (f *MockFetcher) CurrentWeek() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.currentWeek
}

func (f *MockFetcher) FetchRoundMatches(season string, round int) ([]APIMatch, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if round < f.startWeek {
		return []APIMatch{}, nil
	}

	if matches, ok := f.weekStates[round]; ok {
		return matches, nil
	}

	// Auto-generate "Not Started" matches for this round
	matches := generateNotStartedMatches()
	f.weekStates[round] = matches
	return matches, nil
}

// Advance finalizes the current week with random scores and moves to the next week.
func (f *MockFetcher) Advance() []APIMatch {
	f.mu.Lock()
	defer f.mu.Unlock()

	week := f.currentWeek

	// Ensure the week has match data
	if _, ok := f.weekStates[week]; !ok {
		f.weekStates[week] = generateNotStartedMatches()
	}

	// Generate random results with deterministic seed based on week
	rng := rand.New(rand.NewSource(int64(week)))
	matches := f.weekStates[week]
	for i := range matches {
		matches[i] = randomizeResult(matches[i], rng)
	}
	f.weekStates[week] = matches

	f.currentWeek = week + 1
	return matches
}

func generateNotStartedMatches() []APIMatch {
	tomorrow := time.Now().UTC().AddDate(0, 0, 1).Format("2006-01-02")
	matches := make([]APIMatch, len(fixtures))
	for i, fix := range fixtures {
		matches[i] = APIMatch{
			HomeTeam:  fix.Home,
			AwayTeam:  fix.Away,
			HomeScore: "",
			AwayScore: "",
			Status:    "Not Started",
			DateEvent: tomorrow,
			StrTime:   "15:00:00",
			Postponed: "",
		}
	}
	return matches
}

func randomizeResult(m APIMatch, rng *rand.Rand) APIMatch {
	// ~40% home win, ~30% away win, ~30% draw
	roll := rng.Intn(100)
	var hs, as int
	switch {
	case roll < 40: // home win
		hs = rng.Intn(4) + 1 // 1-4
		as = rng.Intn(hs)    // 0 to hs-1
	case roll < 70: // away win
		as = rng.Intn(4) + 1 // 1-4
		hs = rng.Intn(as)    // 0 to as-1
	default: // draw
		hs = rng.Intn(4) // 0-3
		as = hs
	}

	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	m.HomeScore = strconv.Itoa(hs)
	m.AwayScore = strconv.Itoa(as)
	m.Status = "Match Finished"
	m.DateEvent = yesterday
	return m
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./services/ -run "TestMockFetcher|TestNew" -v`
Expected: All 8 tests PASS

- [ ] **Step 5: Run full test suite**

Run: `cd backend && go test ./...`
Expected: Some existing tests may fail because `NewMockFetcher` signature changed from `string` to `int`. Fix in next step.

- [ ] **Step 6: Update `backend/services/fetcher.go` — ensure compliance check still works**

The `var _ MatchFetcher = (*MockFetcher)(nil)` line in `fetcher.go` should still compile since `MockFetcher` still has `FetchRoundMatches`. Verify by running:

Run: `cd backend && go build ./...`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
cd /Users/banek1/Projects/last-man-standing
git add backend/services/mock.go backend/services/mock_test.go
git commit -m "feat: rewrite MockFetcher as stateful with Advance() and random results"
```

---

### Task 2: Export RunGameweekAutomation for dev routes

**Files:**
- Modify: `backend/hooks/gameweek.go`

The advance endpoint needs to trigger the cron logic. Currently `runGameweekAutomation` is unexported. Export it.

- [ ] **Step 1: Rename `runGameweekAutomation` to `RunGameweekAutomation`**

In `backend/hooks/gameweek.go`, change the function name on line 19 from `runGameweekAutomation` to `RunGameweekAutomation`:

```go
func RunGameweekAutomation(app core.App, fetcher services.MatchFetcher) {
```

- [ ] **Step 2: Update the cron caller on line 15**

```go
func RegisterGameweekCron(app core.App, fetcher services.MatchFetcher) {
	app.Cron().MustAdd("gameweek-automation", "*/30 * * * *", func() {
		RunGameweekAutomation(app, fetcher)
	})
}
```

- [ ] **Step 3: Verify build**

Run: `cd backend && go build ./...`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
cd /Users/banek1/Projects/last-man-standing
git add backend/hooks/gameweek.go
git commit -m "refactor: export RunGameweekAutomation for dev routes"
```

---

### Task 3: Add dev routes (matches endpoint + advance endpoint)

**Files:**
- Create: `backend/hooks/dev_routes.go`

- [ ] **Step 1: Create `backend/hooks/dev_routes.go`**

```go
package hooks

import (
	"net/http"
	"strconv"

	"github.com/bajcula/last-man-standing/backend/services"
	"github.com/pocketbase/pocketbase/core"
)

// RegisterDevRoutes adds mock-only API endpoints for local simulation.
// Only call this when MOCK_API is set.
func RegisterDevRoutes(app core.App, fetcher *services.MockFetcher) {
	// GET /api/matches/:round — serves fixture data from the mock fetcher
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.GET("/api/matches/{round}", func(e *core.RequestEvent) error {
			roundStr := e.Request.PathValue("round")
			round, err := strconv.Atoi(roundStr)
			if err != nil {
				return e.JSON(http.StatusBadRequest, map[string]string{"error": "invalid round"})
			}

			season := "2025-2026"
			matches, err := fetcher.FetchRoundMatches(season, round)
			if err != nil {
				return e.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
			}

			return e.JSON(http.StatusOK, map[string]any{"events": matches})
		})

		// POST /api/dev/advance — advance the current week with random results
		se.Router.POST("/api/dev/advance", func(e *core.RequestEvent) error {
			oldWeek := fetcher.CurrentWeek()
			results := fetcher.Advance()

			// Run the cron automation to process the finished week
			RunGameweekAutomation(app, fetcher)

			type matchResult struct {
				Home   string `json:"home"`
				Away   string `json:"away"`
				Score  string `json:"score"`
				Winner string `json:"winner"`
			}

			var summaryResults []matchResult
			for _, m := range results {
				winner := "Draw"
				hs := services.ParseScore(m.HomeScore)
				as := services.ParseScore(m.AwayScore)
				if hs > as {
					winner = m.HomeTeam
				} else if as > hs {
					winner = m.AwayTeam
				}
				summaryResults = append(summaryResults, matchResult{
					Home:   m.HomeTeam,
					Away:   m.AwayTeam,
					Score:  m.HomeScore + "-" + m.AwayScore,
					Winner: winner,
				})
			}

			return e.JSON(http.StatusOK, map[string]any{
				"advanced_week": oldWeek,
				"results":       summaryResults,
				"next_week":     fetcher.CurrentWeek(),
			})
		})

		return se.Next()
	})
}
```

- [ ] **Step 2: Verify build**

Run: `cd backend && go build ./...`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
cd /Users/banek1/Projects/last-man-standing
git add backend/hooks/dev_routes.go
git commit -m "feat: add /api/matches/:round and /api/dev/advance dev endpoints"
```

---

### Task 4: Wire everything in main.go

**Files:**
- Modify: `backend/main.go`

- [ ] **Step 1: Rewrite main.go to parse week number from MOCK_API and wire dev routes**

Replace `backend/main.go` entirely:

```go
package main

import (
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/bajcula/last-man-standing/backend/hooks"
	"github.com/bajcula/last-man-standing/backend/services"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	_ "github.com/bajcula/last-man-standing/backend/migrations"
)

func main() {
	app := pocketbase.New()

	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	var fetcher services.MatchFetcher
	if mockWeek := os.Getenv("MOCK_API"); mockWeek != "" {
		week, err := strconv.Atoi(mockWeek)
		if err != nil || week < 1 || week > 38 {
			log.Fatalf("[MOCK] MOCK_API must be a week number 1-38, got %q", mockWeek)
		}
		log.Printf("[MOCK] Starting simulation at week %d", week)
		mockFetcher := services.NewMockFetcher(week)
		fetcher = mockFetcher
		hooks.RegisterDevRoutes(app, mockFetcher)
	} else {
		fetcher = services.LiveFetcher{}
	}

	hooks.RegisterGameweekCron(app, fetcher)
	hooks.RegisterPicksGuard(app)

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 2: Build and verify**

Run: `cd backend && go build ./...`
Expected: Build succeeds

- [ ] **Step 3: Run all backend tests**

Run: `cd backend && go test ./...`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
cd /Users/banek1/Projects/last-man-standing
git add backend/main.go
git commit -m "feat: wire MOCK_API=<week> with dev routes in main.go"
```

---

### Task 5: Frontend — route through backend in dev mode

**Files:**
- Modify: `frontend/src/utils/api.ts`
- Modify: `frontend/.env`

- [ ] **Step 1: Update `frontend/src/utils/api.ts` to route through backend when VITE_MOCK_API is set**

Replace the `fetchRoundMatches` function (lines 35-41):

```typescript
/**
 * Fetch matches for a specific round.
 * In local dev (VITE_MOCK_API set), fetches from the backend mock.
 * In production, fetches from TheSportsDB directly.
 */
export const fetchRoundMatches = async (round: number): Promise<ApiMatch[]> => {
  if (import.meta.env.VITE_MOCK_API) {
    const pbUrl = import.meta.env.VITE_POCKETBASE_URL || 'http://localhost:8090';
    const response = await fetchWithTimeout(`${pbUrl}/api/matches/${round}`);
    const data = await response.json();
    return (data.events || []) as ApiMatch[];
  }
  const season = getCurrentSeason();
  const url = `https://www.thesportsdb.com/api/v1/json/3/eventsround.php?id=${LEAGUE_ID}&r=${round}&s=${season}`;
  const response = await fetchWithTimeout(url);
  const data = await response.json();
  return (data.events || []) as ApiMatch[];
};
```

- [ ] **Step 2: Add VITE_MOCK_API to `frontend/.env`**

Append to `frontend/.env`:

```
VITE_MOCK_API=true
```

- [ ] **Step 3: Run frontend tests and lint**

Run: `cd frontend && npm test && npm run lint`
Expected: All 16 tests pass, lint clean

- [ ] **Step 4: Commit**

```bash
cd /Users/banek1/Projects/last-man-standing
git add frontend/src/utils/api.ts frontend/.env
git commit -m "feat: route match fetches through backend when VITE_MOCK_API is set"
```

---

### Task 6: Update CLAUDE.md and smoke test

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Mock API section in CLAUDE.md**

Replace the existing "Mock API for Local Development" section:

```markdown
## Mock API for Local Development

Set `MOCK_API` to a starting week number for end-to-end simulation:

```bash
cd backend && MOCK_API=25 go run . serve
```

This starts the app at week 25 with mock match data. The frontend (with `VITE_MOCK_API=true` in `.env`) fetches fixtures from the backend instead of TheSportsDB.

### Simulation workflow

1. Start backend: `MOCK_API=25 go run . serve`
2. Start frontend: `cd frontend && npm run dev`
3. Open the app, create users, make picks
4. Advance the week: `curl -X POST http://localhost:8090/api/dev/advance`
5. Refresh the UI — see results, next week ready
6. Repeat step 3-5

### Dev endpoints (mock mode only)

- `GET /api/matches/:round` — fixture data for a round
- `POST /api/dev/advance` — finalize current week with random scores, run cron

Without `MOCK_API`, the app calls the real TheSportsDB API as normal.
```

- [ ] **Step 2: Run full test suite**

Run: `cd backend && go test ./... && cd ../frontend && npm test`
Expected: All backend + frontend tests pass

- [ ] **Step 3: Smoke test end-to-end**

```bash
# Terminal 1: start backend
cd backend && MOCK_API=25 go run . serve

# Terminal 2: verify endpoints work
curl -s http://localhost:8090/api/matches/25 | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"events\"])} matches, status: {d[\"events\"][0][\"strStatus\"]}')"
# Expected: 10 matches, status: Not Started

curl -s -X POST http://localhost:8090/api/dev/advance | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Advanced week {d[\"advanced_week\"]}, next: {d[\"next_week\"]}')"
# Expected: Advanced week 25, next: 26

curl -s http://localhost:8090/api/matches/25 | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Status: {d[\"events\"][0][\"strStatus\"]}')"
# Expected: Status: Match Finished
```

- [ ] **Step 4: Commit**

```bash
cd /Users/banek1/Projects/last-man-standing
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with MOCK_API simulation workflow"
```
