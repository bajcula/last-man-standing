# Backend Go Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pre-built PocketBase binary + JS hooks with a custom Go PocketBase v0.36.7 app.

**Architecture:** Custom Go app in `backend/` with 4 packages: `gamelogic/` (pure functions, no deps), `services/` (TheSportsDB HTTP client), `hooks/` (cron orchestration), `migrations/` (schema + seed). TDD for all logic.

**Tech Stack:** Go 1.25+, PocketBase v0.36.7, Docker multi-stage build

**Spec:** `docs/superpowers/specs/2026-03-18-go-migration-design.md`

**JS source (port from):** `pocketbase/pb_hooks/gameweek_automation.pb.js`

---

## File Map

| File | Responsibility | Created in Task |
|------|---------------|----------------|
| `backend/go.mod` | Go module definition | 1 |
| `backend/main.go` | PocketBase app entry point, cron + migration registration | 1, 12 |
| `backend/gamelogic/gamelogic.go` | Pure game logic functions (no DB, no HTTP) | 2–5 |
| `backend/gamelogic/gamelogic_test.go` | Unit tests for all game logic | 2–5 |
| `backend/services/sportsdb.go` | TheSportsDB API client, types, team name mapping | 6–8 |
| `backend/services/sportsdb_test.go` | Tests for team lookup and polling window | 7, 8 |
| `backend/migrations/001_schema.go` | All collections in final form | 9 |
| `backend/migrations/002_seed_teams.go` | 20 PL teams seed data | 10 |
| `backend/hooks/gameweek.go` | Cron job handler wiring DB → logic → DB | 11 |
| `backend/Dockerfile` | Multi-stage Go build | 13 |
| `docker-compose.yml` | Updated to build from `backend/` | 13 |
| `railway.json` | Updated for Go deployment | 14 |

---

### Task 1: Project Scaffold

**Files:**
- Create: `backend/go.mod`
- Create: `backend/main.go`

- [ ] **Step 1: Create `backend/go.mod`**

```bash
mkdir -p backend && cd backend && go mod init github.com/bajcula/last-man-standing/backend
```

- [ ] **Step 2: Install PocketBase dependency**

```bash
cd backend && go get github.com/pocketbase/pocketbase@v0.36.7
```

- [ ] **Step 3: Create `backend/main.go` skeleton**

```go
package main

import (
	"log"

	"github.com/pocketbase/pocketbase"
)

func main() {
	app := pocketbase.New()

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd backend && go build ./...`
Expected: no errors, produces binary

- [ ] **Step 5: Commit**

```bash
git add backend/go.mod backend/go.sum backend/main.go
git commit -m "feat: scaffold Go backend with PocketBase v0.36.7"
```

---

### Task 2: Game Logic — GetMatchWinner (TDD)

**Files:**
- Create: `backend/gamelogic/gamelogic.go`
- Create: `backend/gamelogic/gamelogic_test.go`

- [ ] **Step 1: Write failing tests for GetMatchWinner**

`backend/gamelogic/gamelogic_test.go`:
```go
package gamelogic

import "testing"

func TestGetMatchWinner(t *testing.T) {
	tests := []struct {
		name      string
		homeTeam  string
		awayTeam  string
		homeScore int
		awayScore int
		status    string
		want      string
	}{
		{"home win", "Arsenal", "Chelsea", 3, 1, "Match Finished", "Arsenal"},
		{"away win", "Arsenal", "Chelsea", 1, 3, "Match Finished", "Chelsea"},
		{"draw", "Arsenal", "Chelsea", 2, 2, "Match Finished", "Draw"},
		{"zero-zero draw", "Arsenal", "Chelsea", 0, 0, "Match Finished", "Draw"},
		{"not finished", "Arsenal", "Chelsea", 0, 0, "Not Started", ""},
		{"half time", "Arsenal", "Chelsea", 1, 0, "1H", ""},
		{"postponed", "Arsenal", "Chelsea", 0, 0, "Postponed", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GetMatchWinner(tt.homeTeam, tt.awayTeam, tt.homeScore, tt.awayScore, tt.status)
			if got != tt.want {
				t.Errorf("GetMatchWinner() = %q, want %q", got, tt.want)
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./gamelogic/ -v`
Expected: FAIL — `GetMatchWinner` not defined

- [ ] **Step 3: Create `gamelogic.go` with minimal implementation**

`backend/gamelogic/gamelogic.go`:
```go
package gamelogic

// GetMatchWinner returns the winning team name, "Draw" for draws,
// or "" if the match is not finished.
func GetMatchWinner(homeTeam, awayTeam string, homeScore, awayScore int, status string) string {
	if status != "Match Finished" {
		return ""
	}
	if homeScore > awayScore {
		return homeTeam
	}
	if awayScore > homeScore {
		return awayTeam
	}
	return "Draw"
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./gamelogic/ -v`
Expected: PASS — all 7 subtests

- [ ] **Step 5: Commit**

```bash
git add backend/gamelogic/
git commit -m "feat: add GetMatchWinner with tests"
```

---

### Task 3: Game Logic — IsUserEliminated (TDD)

**Files:**
- Modify: `backend/gamelogic/gamelogic.go`
- Modify: `backend/gamelogic/gamelogic_test.go`

- [ ] **Step 1: Add types to `gamelogic.go`**

Add to top of `backend/gamelogic/gamelogic.go` (below package declaration):
```go
// Pick represents a user's team pick for a week.
type Pick struct {
	TeamID     string
	WeekNumber int
}

// Winner represents a winning team for a week.
type Winner struct {
	TeamID     string
	WeekNumber int
}

// Team represents a PL team.
type Team struct {
	ID        string
	TeamName  string
	ShortName string
}
```

- [ ] **Step 2: Write failing tests for IsUserEliminated**

Append to `backend/gamelogic/gamelogic_test.go`:
```go
func TestIsUserEliminated(t *testing.T) {
	winners := []Winner{
		{TeamID: "arsenal_id", WeekNumber: 1},
		{TeamID: "villa_id", WeekNumber: 1},
		{TeamID: "chelsea_id", WeekNumber: 2},
		{TeamID: "city_id", WeekNumber: 2},
	}

	tests := []struct {
		name        string
		picks       []Pick
		winners     []Winner
		currentWeek int
		want        bool
	}{
		{
			"week 1 — nobody eliminated",
			[]Pick{},
			winners,
			1,
			false,
		},
		{
			"winning picks — not eliminated",
			[]Pick{
				{TeamID: "arsenal_id", WeekNumber: 1},
				{TeamID: "chelsea_id", WeekNumber: 2},
			},
			winners,
			3,
			false,
		},
		{
			"losing pick — eliminated",
			[]Pick{
				{TeamID: "arsenal_id", WeekNumber: 1},
				{TeamID: "spurs_id", WeekNumber: 2},
			},
			winners,
			3,
			true,
		},
		{
			"no pick for played week — eliminated",
			[]Pick{
				{TeamID: "arsenal_id", WeekNumber: 1},
			},
			winners,
			3,
			true,
		},
		{
			"skip weeks with no declared winners",
			[]Pick{
				{TeamID: "arsenal_id", WeekNumber: 1},
				{TeamID: "chelsea_id", WeekNumber: 3},
			},
			[]Winner{
				{TeamID: "arsenal_id", WeekNumber: 1},
				// week 2 has no winners (not played)
				{TeamID: "chelsea_id", WeekNumber: 3},
			},
			4,
			false,
		},
		{
			"eliminated on first losing week",
			[]Pick{
				{TeamID: "loser_id", WeekNumber: 1},
				{TeamID: "chelsea_id", WeekNumber: 2},
			},
			winners,
			3,
			true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsUserEliminated(tt.picks, tt.winners, tt.currentWeek)
			if got != tt.want {
				t.Errorf("IsUserEliminated() = %v, want %v", got, tt.want)
			}
		})
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && go test ./gamelogic/ -v -run TestIsUserEliminated`
Expected: FAIL — `IsUserEliminated` not defined

- [ ] **Step 4: Implement IsUserEliminated**

Add to `backend/gamelogic/gamelogic.go`:
```go
// IsUserEliminated checks all previous weeks (1 to currentWeek-1).
// Skips weeks with no declared winners. Returns true if user has no pick
// for a played week or their team is not in that week's winners.
func IsUserEliminated(userPicks []Pick, allWinners []Winner, currentWeek int) bool {
	if currentWeek <= 1 {
		return false
	}
	for week := 1; week < currentWeek; week++ {
		// Collect winners for this week
		var weekWinners []Winner
		for _, w := range allWinners {
			if w.WeekNumber == week {
				weekWinners = append(weekWinners, w)
			}
		}
		// Skip weeks with no declared winners
		if len(weekWinners) == 0 {
			continue
		}
		// Find user's pick for this week
		var pickTeamID string
		found := false
		for _, p := range userPicks {
			if p.WeekNumber == week {
				pickTeamID = p.TeamID
				found = true
				break
			}
		}
		if !found {
			return true
		}
		// Check if picked team won
		won := false
		for _, w := range weekWinners {
			if w.TeamID == pickTeamID {
				won = true
				break
			}
		}
		if !won {
			return true
		}
	}
	return false
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && go test ./gamelogic/ -v -run TestIsUserEliminated`
Expected: PASS — all 6 subtests

- [ ] **Step 6: Commit**

```bash
git add backend/gamelogic/
git commit -m "feat: add IsUserEliminated with tests"
```

---

### Task 4: Game Logic — GetFirstAvailableTeam (TDD)

**Files:**
- Modify: `backend/gamelogic/gamelogic.go`
- Modify: `backend/gamelogic/gamelogic_test.go`

- [ ] **Step 1: Write failing tests**

Append to `backend/gamelogic/gamelogic_test.go`:
```go
func TestGetFirstAvailableTeam(t *testing.T) {
	teams := []Team{
		{ID: "1", TeamName: "Chelsea", ShortName: "CHE"},
		{ID: "2", TeamName: "Aston Villa", ShortName: "AVL"},
		{ID: "3", TeamName: "Brighton and Hove Albion", ShortName: "BHA"},
		{ID: "4", TeamName: "Arsenal", ShortName: "ARS"},
	}

	tests := []struct {
		name       string
		usedIDs    []string
		teams      []Team
		wantID     string
		wantNil    bool
	}{
		{"no picks — returns Arsenal (first alpha)", []string{}, teams, "4", false},
		{"Arsenal used — returns Aston Villa", []string{"4"}, teams, "2", false},
		{"Arsenal+Villa used — returns Brighton", []string{"4", "2"}, teams, "3", false},
		{"all used — returns nil", []string{"1", "2", "3", "4"}, teams, "", true},
		{"empty teams — returns nil", []string{}, []Team{}, "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GetFirstAvailableTeam(tt.usedIDs, tt.teams)
			if tt.wantNil {
				if got != nil {
					t.Errorf("GetFirstAvailableTeam() = %v, want nil", got)
				}
				return
			}
			if got == nil {
				t.Fatal("GetFirstAvailableTeam() = nil, want non-nil")
			}
			if got.ID != tt.wantID {
				t.Errorf("GetFirstAvailableTeam().ID = %q, want %q", got.ID, tt.wantID)
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./gamelogic/ -v -run TestGetFirstAvailableTeam`
Expected: FAIL — `GetFirstAvailableTeam` not defined

- [ ] **Step 3: Implement GetFirstAvailableTeam**

Add to `backend/gamelogic/gamelogic.go`:
```go
import "sort"

// GetFirstAvailableTeam returns the first team alphabetically (by TeamName)
// whose ID is not in usedTeamIDs. Returns nil if all teams are used.
func GetFirstAvailableTeam(usedTeamIDs []string, allTeams []Team) *Team {
	if len(allTeams) == 0 {
		return nil
	}
	sorted := make([]Team, len(allTeams))
	copy(sorted, allTeams)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].TeamName < sorted[j].TeamName
	})
	usedSet := make(map[string]bool, len(usedTeamIDs))
	for _, id := range usedTeamIDs {
		usedSet[id] = true
	}
	for i := range sorted {
		if !usedSet[sorted[i].ID] {
			return &sorted[i]
		}
	}
	return nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./gamelogic/ -v -run TestGetFirstAvailableTeam`
Expected: PASS — all 5 subtests

- [ ] **Step 5: Commit**

```bash
git add backend/gamelogic/
git commit -m "feat: add GetFirstAvailableTeam with tests"
```

---

### Task 5: Game Logic — GetCurrentSeason + CalculateDeadline (TDD)

**Files:**
- Modify: `backend/gamelogic/gamelogic.go`
- Modify: `backend/gamelogic/gamelogic_test.go`

- [ ] **Step 1: Write failing tests**

Append to `backend/gamelogic/gamelogic_test.go`:
```go
import "time"

func TestGetCurrentSeason(t *testing.T) {
	tests := []struct {
		name string
		now  time.Time
		want string
	}{
		{"august 2025 — new season", time.Date(2025, 8, 1, 0, 0, 0, 0, time.UTC), "2025-2026"},
		{"december 2025 — same season", time.Date(2025, 12, 15, 0, 0, 0, 0, time.UTC), "2025-2026"},
		{"july 2026 — still prev season", time.Date(2026, 7, 31, 0, 0, 0, 0, time.UTC), "2025-2026"},
		{"march 2026 — mid-season", time.Date(2026, 3, 18, 0, 0, 0, 0, time.UTC), "2025-2026"},
		{"august 2026 — next season", time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC), "2026-2027"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GetCurrentSeason(tt.now)
			if got != tt.want {
				t.Errorf("GetCurrentSeason() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCalculateDeadline(t *testing.T) {
	now := time.Date(2026, 3, 18, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name    string
		matches []Match
		now     time.Time
		want    time.Time
	}{
		{
			"normal — 2hrs before earliest future kickoff",
			[]Match{
				{DateEvent: "2026-03-20", StrTime: "15:00:00", Status: "Not Started", Postponed: ""},
				{DateEvent: "2026-03-21", StrTime: "17:30:00", Status: "Not Started", Postponed: ""},
			},
			now,
			time.Date(2026, 3, 20, 13, 0, 0, 0, time.UTC),
		},
		{
			"skip past matches",
			[]Match{
				{DateEvent: "2026-03-10", StrTime: "15:00:00", Status: "Match Finished", Postponed: ""},
				{DateEvent: "2026-03-22", StrTime: "12:30:00", Status: "Not Started", Postponed: ""},
			},
			now,
			time.Date(2026, 3, 22, 10, 30, 0, 0, time.UTC),
		},
		{
			"skip postponed matches",
			[]Match{
				{DateEvent: "2026-03-19", StrTime: "20:00:00", Status: "Not Started", Postponed: "yes"},
				{DateEvent: "2026-03-21", StrTime: "15:00:00", Status: "Not Started", Postponed: ""},
			},
			now,
			time.Date(2026, 3, 21, 13, 0, 0, 0, time.UTC),
		},
		{
			"all past — fallback 7 days at 12:00 UTC",
			[]Match{
				{DateEvent: "2026-03-10", StrTime: "15:00:00", Status: "Match Finished", Postponed: ""},
			},
			now,
			time.Date(2026, 3, 25, 12, 0, 0, 0, time.UTC),
		},
		{
			"empty matches — fallback",
			[]Match{},
			now,
			time.Date(2026, 3, 25, 12, 0, 0, 0, time.UTC),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalculateDeadline(tt.matches, tt.now)
			if !got.Equal(tt.want) {
				t.Errorf("CalculateDeadline() = %v, want %v", got, tt.want)
			}
		})
	}
}
```

Note: `Match` is defined in `services/sportsdb.go` (Task 6), but the test needs it here. We'll use a local type alias or define `Match` in `gamelogic` since `CalculateDeadline` is a pure function. Actually, to keep gamelogic pure, define a `Match` struct in gamelogic that has only the fields needed:

Add to `backend/gamelogic/gamelogic.go` types section:
```go
// Match holds the fields needed for deadline calculation.
// Mapped from the TheSportsDB API response.
type Match struct {
	DateEvent string // "2026-03-20"
	StrTime   string // "15:00:00"
	Status    string // "Match Finished", "Not Started", etc.
	Postponed string // "yes" or ""
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./gamelogic/ -v -run "TestGetCurrentSeason|TestCalculateDeadline"`
Expected: FAIL — functions not defined

- [ ] **Step 3: Implement both functions**

Add to `backend/gamelogic/gamelogic.go`:
```go
import (
	"fmt"
	"sort"
	"time"
)

// GetCurrentSeason derives the season string from the given time.
// Aug+ = current year is start year. Returns e.g. "2025-2026".
func GetCurrentSeason(now time.Time) string {
	startYear := now.Year()
	if now.Month() < time.August {
		startYear--
	}
	return fmt.Sprintf("%d-%d", startYear, startYear+1)
}

const DeadlineBufferHours = 2

// CalculateDeadline finds the earliest future, non-postponed match kickoff
// and subtracts the deadline buffer. Falls back to 7 days from now at 12:00 UTC.
func CalculateDeadline(matches []Match, now time.Time) time.Time {
	var earliest *time.Time
	for _, m := range matches {
		if m.Postponed == "yes" {
			continue
		}
		strTime := m.StrTime
		if strTime == "" {
			strTime = "00:00:00"
		}
		ko, err := time.Parse("2006-01-02T15:04:05", m.DateEvent+"T"+strTime)
		if err != nil {
			continue
		}
		if ko.Before(now) {
			continue
		}
		if earliest == nil || ko.Before(*earliest) {
			earliest = &ko
		}
	}
	if earliest != nil {
		return earliest.Add(-time.Duration(DeadlineBufferHours) * time.Hour)
	}
	// Fallback: 7 days from now at 12:00 UTC
	fallback := now.AddDate(0, 0, 7)
	return time.Date(fallback.Year(), fallback.Month(), fallback.Day(), 12, 0, 0, 0, time.UTC)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./gamelogic/ -v -run "TestGetCurrentSeason|TestCalculateDeadline"`
Expected: PASS — all 10 subtests

- [ ] **Step 5: Run full gamelogic test suite**

Run: `cd backend && go test ./gamelogic/ -v`
Expected: PASS — all tests (GetMatchWinner + IsUserEliminated + GetFirstAvailableTeam + GetCurrentSeason + CalculateDeadline)

- [ ] **Step 6: Commit**

```bash
git add backend/gamelogic/
git commit -m "feat: add GetCurrentSeason and CalculateDeadline with tests"
```

---

### Task 6: Services — Types, Constants, TeamNameMap

**Files:**
- Create: `backend/services/sportsdb.go`

- [ ] **Step 1: Create sportsdb.go with types and constants**

`backend/services/sportsdb.go`:
```go
package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	LeagueID          = "4328" // English Premier League
	APIBase           = "https://www.thesportsdb.com/api/v1/json/3"
	APITimeout        = 30 * time.Second
	ResultsBufferHours = 5
	StartWeek         = 30
)

// SkipStatuses are match statuses treated as "resolved" — don't block gameweek completion.
var SkipStatuses = map[string]bool{
	"Postponed": true,
	"Cancelled": true,
	"Abandoned": true,
	"Awarded":   true,
}

// IsSkippedStatus returns true if the status means the match won't be played normally.
func IsSkippedStatus(status string) bool {
	return SkipStatuses[status]
}

// APIMatch represents a match from the TheSportsDB API response.
type APIMatch struct {
	HomeTeam  string `json:"strHomeTeam"`
	AwayTeam  string `json:"strAwayTeam"`
	HomeScore string `json:"intHomeScore"`
	AwayScore string `json:"intAwayScore"`
	Status    string `json:"strStatus"`
	DateEvent string `json:"dateEvent"`
	StrTime   string `json:"strTime"`
	Postponed string `json:"strPostponed"`
}

// RoundResponse is the top-level API response for a round query.
type RoundResponse struct {
	Events []APIMatch `json:"events"`
}

// TeamNameMap maps API alternate team names to canonical DB names.
var TeamNameMap = map[string]string{
	"Man United":   "Manchester United",
	"Man City":     "Manchester City",
	"Newcastle":    "Newcastle United",
	"West Ham":     "West Ham United",
	"Tottenham":    "Tottenham Hotspur",
	"Spurs":        "Tottenham Hotspur",
	"Leicester":    "Leicester City",
	"Wolves":       "Wolverhampton Wanderers",
	"Wolverhampton": "Wolverhampton Wanderers",
	"Nottm Forest":  "Nottingham Forest",
	"Brighton":      "Brighton and Hove Albion",
	"Nott'm Forest": "Nottingham Forest",
}

// Team mirrors gamelogic.Team for use in services. The hooks layer
// converts between PocketBase records and this struct.
type Team struct {
	ID       string
	TeamName string
}

// FindTeamByApiName performs a 3-tier lookup matching the JS behavior:
// 1. Check TeamNameMap → find mapped canonical name in teams
// 2. Exact match on TeamName
// 3. Partial match: TeamName contains apiName, or apiName contains first word of TeamName
func FindTeamByApiName(apiName string, teams []Team) *Team {
	// Tier 1: mapped name
	if mapped, ok := TeamNameMap[apiName]; ok {
		for i := range teams {
			if teams[i].TeamName == mapped {
				return &teams[i]
			}
		}
	}
	// Tier 2: exact match
	for i := range teams {
		if teams[i].TeamName == apiName {
			return &teams[i]
		}
	}
	// Tier 3: partial/fuzzy
	for i := range teams {
		tn := teams[i].TeamName
		if strings.Contains(tn, apiName) {
			return &teams[i]
		}
		parts := strings.SplitN(tn, " ", 2)
		if len(parts) > 0 && strings.Contains(apiName, parts[0]) {
			return &teams[i]
		}
	}
	return nil
}

// FetchRoundMatches fetches match data from TheSportsDB for a given season and round.
func FetchRoundMatches(season string, round int) ([]APIMatch, error) {
	url := fmt.Sprintf("%s/eventsround.php?id=%s&r=%d&s=%s", APIBase, LeagueID, round, season)
	client := &http.Client{Timeout: APITimeout}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response body: %w", err)
	}
	var result RoundResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parsing JSON: %w", err)
	}
	if result.Events == nil {
		return []APIMatch{}, nil
	}
	return result.Events, nil
}

// GetPollingWindow determines if the cron should actively poll for results.
// Returns (active, reason).
func GetPollingWindow(matches []APIMatch, now time.Time) (bool, string) {
	if len(matches) == 0 {
		return false, "no matches"
	}
	var earliest, latest *time.Time
	for _, m := range matches {
		if IsSkippedStatus(m.Status) {
			continue
		}
		strTime := m.StrTime
		if strTime == "" {
			strTime = "00:00:00"
		}
		ko, err := time.Parse("2006-01-02T15:04:05", m.DateEvent+"T"+strTime)
		if err != nil {
			continue
		}
		if earliest == nil || ko.Before(*earliest) {
			earliest = &ko
		}
		if latest == nil || ko.After(*latest) {
			latest = &ko
		}
	}
	if earliest == nil || latest == nil {
		return false, "all matches postponed/cancelled"
	}
	activeEnd := latest.Add(time.Duration(ResultsBufferHours) * time.Hour)
	if now.Before(*earliest) {
		return false, "before first kickoff"
	}
	if now.After(activeEnd) {
		return false, "past results window"
	}
	return true, ""
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd backend && go build ./services/`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/services/sportsdb.go
git commit -m "feat: add TheSportsDB client types, constants, and functions"
```

---

### Task 7: Services — FindTeamByApiName + GetPollingWindow Tests (TDD)

**Files:**
- Create: `backend/services/sportsdb_test.go`

- [ ] **Step 1: Write tests for FindTeamByApiName**

`backend/services/sportsdb_test.go`:
```go
package services

import (
	"testing"
	"time"
)

func TestFindTeamByApiName(t *testing.T) {
	teams := []Team{
		{ID: "1", TeamName: "Arsenal"},
		{ID: "2", TeamName: "Manchester United"},
		{ID: "3", TeamName: "Wolverhampton Wanderers"},
		{ID: "4", TeamName: "Brighton and Hove Albion"},
		{ID: "5", TeamName: "Nottingham Forest"},
		{ID: "6", TeamName: "Newcastle United"},
	}

	tests := []struct {
		name    string
		apiName string
		wantID  string
		wantNil bool
	}{
		{"exact match", "Arsenal", "1", false},
		{"mapped: Man United", "Man United", "2", false},
		{"mapped: Wolves", "Wolves", "3", false},
		{"mapped: Brighton", "Brighton", "4", false},
		{"mapped: Nottm Forest", "Nottm Forest", "5", false},
		{"mapped: Nott'm Forest", "Nott'm Forest", "5", false},
		{"mapped: Newcastle", "Newcastle", "6", false},
		{"not found", "Fake FC", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FindTeamByApiName(tt.apiName, teams)
			if tt.wantNil {
				if got != nil {
					t.Errorf("FindTeamByApiName(%q) = %v, want nil", tt.apiName, got)
				}
				return
			}
			if got == nil {
				t.Fatalf("FindTeamByApiName(%q) = nil, want ID %q", tt.apiName, tt.wantID)
			}
			if got.ID != tt.wantID {
				t.Errorf("FindTeamByApiName(%q).ID = %q, want %q", tt.apiName, got.ID, tt.wantID)
			}
		})
	}
}

func TestIsSkippedStatus(t *testing.T) {
	tests := []struct {
		status string
		want   bool
	}{
		{"Postponed", true},
		{"Cancelled", true},
		{"Abandoned", true},
		{"Awarded", true},
		{"Match Finished", false},
		{"Not Started", false},
		{"1H", false},
	}
	for _, tt := range tests {
		t.Run(tt.status, func(t *testing.T) {
			if got := IsSkippedStatus(tt.status); got != tt.want {
				t.Errorf("IsSkippedStatus(%q) = %v, want %v", tt.status, got, tt.want)
			}
		})
	}
}

func TestGetPollingWindow(t *testing.T) {
	tests := []struct {
		name       string
		matches    []APIMatch
		now        time.Time
		wantActive bool
		wantReason string
	}{
		{
			"no matches",
			[]APIMatch{},
			time.Date(2026, 3, 20, 15, 0, 0, 0, time.UTC),
			false,
			"no matches",
		},
		{
			"before first kickoff",
			[]APIMatch{
				{DateEvent: "2026-03-20", StrTime: "15:00:00", Status: "Not Started"},
			},
			time.Date(2026, 3, 20, 10, 0, 0, 0, time.UTC),
			false,
			"before first kickoff",
		},
		{
			"during match window",
			[]APIMatch{
				{DateEvent: "2026-03-20", StrTime: "15:00:00", Status: "Not Started"},
			},
			time.Date(2026, 3, 20, 16, 0, 0, 0, time.UTC),
			true,
			"",
		},
		{
			"past results window",
			[]APIMatch{
				{DateEvent: "2026-03-20", StrTime: "15:00:00", Status: "Match Finished"},
			},
			time.Date(2026, 3, 20, 21, 0, 0, 0, time.UTC),
			false,
			"past results window",
		},
		{
			"all postponed",
			[]APIMatch{
				{DateEvent: "2026-03-20", StrTime: "15:00:00", Status: "Postponed"},
			},
			time.Date(2026, 3, 20, 16, 0, 0, 0, time.UTC),
			false,
			"all matches postponed/cancelled",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			active, reason := GetPollingWindow(tt.matches, tt.now)
			if active != tt.wantActive {
				t.Errorf("active = %v, want %v", active, tt.wantActive)
			}
			if reason != tt.wantReason {
				t.Errorf("reason = %q, want %q", reason, tt.wantReason)
			}
		})
	}
}
```

- [ ] **Step 2: Run tests**

Run: `cd backend && go test ./services/ -v`
Expected: PASS — all subtests

- [ ] **Step 3: Commit**

```bash
git add backend/services/sportsdb_test.go
git commit -m "test: add FindTeamByApiName, IsSkippedStatus, GetPollingWindow tests"
```

---

### Task 8: Services — ParseScore helper

**Files:**
- Modify: `backend/services/sportsdb.go`
- Modify: `backend/services/sportsdb_test.go`

The hooks layer needs to parse string scores from the API (`"3"`, `""`, `null`) into ints for `GetMatchWinner`. Add a helper.

- [ ] **Step 1: Write failing test**

Append to `backend/services/sportsdb_test.go`:
```go
func TestParseScore(t *testing.T) {
	tests := []struct {
		input string
		want  int
	}{
		{"3", 3},
		{"0", 0},
		{"", 0},
		{"abc", 0},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			if got := ParseScore(tt.input); got != tt.want {
				t.Errorf("ParseScore(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./services/ -v -run TestParseScore`
Expected: FAIL — `ParseScore` not defined

- [ ] **Step 3: Implement ParseScore**

Add to `backend/services/sportsdb.go`:
```go
import "strconv"

// ParseScore converts a string score from the API to int.
// Returns 0 for empty strings or parse errors (matching JS parseInt(x) || 0).
// Uses TrimSpace to handle edge cases like "3 " that strconv.Atoi would reject.
func ParseScore(s string) int {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return 0
	}
	return n
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./services/ -v -run TestParseScore`
Expected: PASS

- [ ] **Step 5: Run full services test suite**

Run: `cd backend && go test ./services/ -v`
Expected: PASS — all tests

- [ ] **Step 6: Commit**

```bash
git add backend/services/
git commit -m "feat: add ParseScore helper with tests"
```

---

### Task 9: Migration — Schema (001_schema.go)

**Files:**
- Create: `backend/migrations/001_schema.go`

Reference: `pocketbase/pb_migrations/` JS files (final schema state)

- [ ] **Step 1: Create schema migration**

`backend/migrations/001_schema.go`:
```go
package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		openRule := types.Pointer("")

		// --- teams ---
		teams := core.NewBaseCollection("teams")
		teams.ListRule = openRule
		teams.ViewRule = openRule
		teams.CreateRule = openRule
		teams.UpdateRule = openRule
		teams.DeleteRule = openRule
		teams.Fields.Add(
			&core.TextField{Name: "team_name", Required: true},
			&core.TextField{Name: "team_short_name", Required: true},
		)
		if err := app.Save(teams); err != nil {
			return err
		}

		// --- picks ---
		picks := core.NewBaseCollection("picks")
		picks.ListRule = openRule
		picks.ViewRule = openRule
		picks.CreateRule = openRule
		picks.UpdateRule = openRule
		picks.DeleteRule = openRule
		picks.Fields.Add(
			&core.RelationField{
				Name:          "user_id",
				CollectionId:  "_pb_users_auth_",
				MaxSelect:     1,
				CascadeDelete: false,
			},
			&core.RelationField{
				Name:          "team_id",
				CollectionId:  teams.Id,
				MaxSelect:     1,
				CascadeDelete: false,
			},
			&core.NumberField{Name: "week_number", Required: true},
		)
		if err := app.Save(picks); err != nil {
			return err
		}

		// --- deadlines ---
		deadlines := core.NewBaseCollection("deadlines")
		deadlines.ListRule = openRule
		deadlines.ViewRule = openRule
		deadlines.CreateRule = openRule
		deadlines.UpdateRule = openRule
		deadlines.DeleteRule = openRule
		deadlines.Fields.Add(
			&core.NumberField{Name: "week_number", Required: true},
			&core.DateField{Name: "deadline_time", Required: true},
			&core.BoolField{Name: "is_closed"},
		)
		if err := app.Save(deadlines); err != nil {
			return err
		}

		// --- winning_teams ---
		winningTeams := core.NewBaseCollection("winning_teams")
		winningTeams.ListRule = openRule
		winningTeams.ViewRule = openRule
		winningTeams.CreateRule = openRule
		winningTeams.UpdateRule = openRule
		winningTeams.DeleteRule = openRule
		winningTeams.Fields.Add(
			&core.NumberField{Name: "week_number", Required: true},
			&core.RelationField{
				Name:          "team_id",
				CollectionId:  teams.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: false,
			},
		)
		if err := app.Save(winningTeams); err != nil {
			return err
		}

		// --- users (modify existing auth collection) ---
		users, err := app.FindCollectionByNameOrId("_pb_users_auth_")
		if err != nil {
			return err
		}
		users.ListRule = openRule
		users.ViewRule = openRule
		users.UpdateRule = openRule
		users.DeleteRule = openRule
		users.Fields.Add(
			&core.TextField{Name: "first_name", Required: true, Min: 2},
			&core.TextField{Name: "last_name", Required: true, Min: 2},
			&core.BoolField{Name: "isAdmin"},
		)
		return app.Save(users)
	}, func(app core.App) error {
		// Revert: delete custom collections, leave users as-is
		for _, name := range []string{"winning_teams", "picks", "deadlines", "teams"} {
			if c, err := app.FindCollectionByNameOrId(name); err == nil {
				if err := app.Delete(c); err != nil {
					return err
				}
			}
		}
		return nil
	})
}
```

**Important:** The exact PocketBase v0.36 field struct names (`core.TextField`, `core.NumberField`, `core.DateField`, `core.BoolField`, `core.RelationField`) and their field names (`Required`, `Min`, `MaxSelect`, `CollectionId`, `CascadeDelete`) must be verified against the PocketBase v0.36 Go docs during implementation. The skeleton above follows the patterns from context7 docs. If field names differ, adjust accordingly.

- [ ] **Step 2: Verify it compiles**

Run: `cd backend && go build ./migrations/`
Expected: no errors (or adjustment needed for exact field struct names)

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/001_schema.go
git commit -m "feat: add schema migration for all collections"
```

---

### Task 10: Migration — Seed Teams (002_seed_teams.go)

**Files:**
- Create: `backend/migrations/002_seed_teams.go`

- [ ] **Step 1: Create seed migration**

`backend/migrations/002_seed_teams.go`:
```go
package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		teams := []struct {
			Name      string
			ShortName string
		}{
			{"Arsenal", "ARS"},
			{"Aston Villa", "AVL"},
			{"Bournemouth", "BOU"},
			{"Brentford", "BRE"},
			{"Brighton and Hove Albion", "BHA"},
			{"Burnley", "BUR"},
			{"Chelsea", "CHE"},
			{"Crystal Palace", "CRY"},
			{"Everton", "EVE"},
			{"Fulham", "FUL"},
			{"Leeds United", "LEE"},
			{"Liverpool", "LIV"},
			{"Manchester City", "MCI"},
			{"Manchester United", "MUN"},
			{"Newcastle United", "NEW"},
			{"Nottingham Forest", "NFO"},
			{"Sunderland", "SUN"},
			{"Tottenham Hotspur", "TOT"},
			{"West Ham United", "WHU"},
			{"Wolverhampton Wanderers", "WOL"},
		}

		// Skip if teams already exist (idempotent)
		existing, _ := app.FindRecordsByFilter("teams", "id != ''", "", 1, 0)
		if len(existing) > 0 {
			return nil
		}

		collection, err := app.FindCollectionByNameOrId("teams")
		if err != nil {
			return err
		}

		for _, t := range teams {
			record := core.NewRecord(collection)
			record.Set("team_name", t.Name)
			record.Set("team_short_name", t.ShortName)
			if err := app.Save(record); err != nil {
				return err
			}
		}
		return nil
	}, func(app core.App) error {
		records, err := app.FindRecordsByFilter("teams", "id != ''", "", 0, 0)
		if err != nil {
			return nil // nothing to revert
		}
		for _, r := range records {
			if err := app.Delete(r); err != nil {
				return err
			}
		}
		return nil
	})
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd backend && go build ./migrations/`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/002_seed_teams.go
git commit -m "feat: add seed migration for 20 PL teams"
```

---

### Task 11: Cron Hook — gameweek.go

**Files:**
- Create: `backend/hooks/gameweek.go`

This is the glue layer — orchestrates DB queries, calls game logic, writes results. Port of `pocketbase/pb_hooks/gameweek_automation.pb.js` (302 lines).

- [ ] **Step 1: Create `backend/hooks/gameweek.go`**

`backend/hooks/gameweek.go`:
```go
package hooks

import (
	"log"
	"strconv"
	"time"

	"github.com/bajcula/last-man-standing/backend/gamelogic"
	"github.com/bajcula/last-man-standing/backend/services"
	"github.com/pocketbase/pocketbase/core"
)

// RegisterGameweekCron registers the gameweek automation cron job.
func RegisterGameweekCron(app core.App) {
	app.Cron().MustAdd("gameweek-automation", "*/30 * * * *", func() {
		runGameweekAutomation(app)
	})
}

func runGameweekAutomation(app core.App) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[AUTOMATION] Panic recovered: %v", r)
		}
	}()

	// First-run bootstrap
	hasDeadlines := false
	existing, _ := app.FindRecordsByFilter("deadlines", "id != ''", "", 1, 0)
	if len(existing) > 0 {
		hasDeadlines = true
	}

	now := time.Now().UTC()
	season := gamelogic.GetCurrentSeason(now)

	if !hasDeadlines {
		log.Printf("[AUTOMATION] First run - initializing at week %d", services.StartWeek)
		createDeadline(app, services.StartWeek, season)
		autoAssignPicks(app, services.StartWeek)
		log.Println("[AUTOMATION] Initial setup complete")
		return
	}

	currentWeek := getCurrentWeek(app)
	log.Printf("[AUTOMATION] Cron tick - week %d", currentWeek)

	if weekAlreadyProcessed(app, currentWeek) {
		log.Printf("[AUTOMATION] Week %d done. Ensuring next week ready.", currentWeek)
		ensureNextWeekReady(app, currentWeek, season)
		return
	}

	matches, err := services.FetchRoundMatches(season, currentWeek)
	if err != nil {
		log.Printf("[AUTOMATION] Fetch failed: %v", err)
		return
	}
	if len(matches) == 0 {
		log.Printf("[AUTOMATION] No matches for week %d", currentWeek)
		return
	}

	allResolved := true
	doneCount := 0
	skippedCount := 0
	for _, m := range matches {
		if m.Status == "Match Finished" {
			doneCount++
		} else if services.IsSkippedStatus(m.Status) {
			skippedCount++
			log.Printf("[AUTOMATION] Skipping %s match: %s vs %s", m.Status, m.HomeTeam, m.AwayTeam)
		} else {
			allResolved = false
		}
	}

	if allResolved {
		log.Printf("[AUTOMATION] All matches resolved (%d finished, %d skipped). Processing week %d", doneCount, skippedCount, currentWeek)
		markWinners(app, currentWeek, matches)
		ensureNextWeekReady(app, currentWeek, season)
		return
	}

	active, reason := services.GetPollingWindow(matches, now)
	if !active {
		log.Printf("[AUTOMATION] Skipping - %s (%d/%d finished, %d skipped)", reason, doneCount, len(matches), skippedCount)
		return
	}

	log.Printf("[AUTOMATION] %d/%d finished, %d skipped. Waiting.", doneCount, len(matches), skippedCount)
}

func getCurrentWeek(app core.App) int {
	records, err := app.FindRecordsByFilter("deadlines", "id != ''", "-week_number", 1, 0)
	if err != nil || len(records) == 0 {
		return services.StartWeek
	}
	return int(records[0].GetFloat("week_number"))
}

func weekAlreadyProcessed(app core.App, week int) bool {
	records, err := app.FindRecordsByFilter("winning_teams", "week_number = "+strconv.Itoa(week), "", 1, 0)
	if err != nil {
		return false
	}
	return len(records) > 0
}

func markWinners(app core.App, weekNumber int, matches []services.APIMatch) {
	allTeams, err := app.FindRecordsByFilter("teams", "id != ''", "", 0, 0)
	if err != nil {
		log.Printf("[AUTOMATION] Failed to load teams: %v", err)
		return
	}

	// Convert PB records to services.Team for FindTeamByApiName
	teamSlice := make([]services.Team, len(allTeams))
	for i, t := range allTeams {
		teamSlice[i] = services.Team{
			ID:       t.Id,
			TeamName: t.GetString("team_name"),
		}
	}

	col, err := app.FindCollectionByNameOrId("winning_teams")
	if err != nil {
		log.Printf("[AUTOMATION] Failed to find winning_teams collection: %v", err)
		return
	}

	count := 0
	for _, m := range matches {
		winner := gamelogic.GetMatchWinner(
			m.HomeTeam, m.AwayTeam,
			services.ParseScore(m.HomeScore), services.ParseScore(m.AwayScore),
			m.Status,
		)
		if winner == "" || winner == "Draw" {
			continue
		}
		dbTeam := services.FindTeamByApiName(winner, teamSlice)
		if dbTeam == nil {
			log.Printf("[AUTOMATION] WARNING: team not found: %s", winner)
			continue
		}
		// Idempotent: skip if already exists
		existing, _ := app.FindRecordsByFilter(
			"winning_teams",
			"week_number = "+strconv.Itoa(weekNumber)+" && team_id = '"+dbTeam.ID+"'",
			"", 1, 0,
		)
		if len(existing) > 0 {
			continue
		}
		record := core.NewRecord(col)
		record.Set("week_number", weekNumber)
		record.Set("team_id", dbTeam.ID)
		if err := app.Save(record); err != nil {
			log.Printf("[AUTOMATION] Failed to save winner: %v", err)
			continue
		}
		count++
	}
	log.Printf("[AUTOMATION] Marked %d winners for week %d", count, weekNumber)
}

func createDeadline(app core.App, weekNumber int, season string) {
	// Idempotent check
	existing, _ := app.FindRecordsByFilter("deadlines", "week_number = "+strconv.Itoa(weekNumber), "", 1, 0)
	if len(existing) > 0 {
		log.Printf("[AUTOMATION] Deadline for week %d already exists, skipping.", weekNumber)
		return
	}

	now := time.Now().UTC()
	var deadlineTime time.Time

	matches, err := services.FetchRoundMatches(season, weekNumber)
	if err != nil {
		log.Printf("[AUTOMATION] Could not fetch week %d for deadline: %v", weekNumber, err)
	}

	if len(matches) > 0 {
		// Convert APIMatch to gamelogic.Match for CalculateDeadline
		glMatches := make([]gamelogic.Match, len(matches))
		for i, m := range matches {
			glMatches[i] = gamelogic.Match{
				DateEvent: m.DateEvent,
				StrTime:   m.StrTime,
				Status:    m.Status,
				Postponed: m.Postponed,
			}
		}
		deadlineTime = gamelogic.CalculateDeadline(glMatches, now)
	} else {
		// Fallback: 7 days from now at 12:00 UTC
		fb := now.AddDate(0, 0, 7)
		deadlineTime = time.Date(fb.Year(), fb.Month(), fb.Day(), 12, 0, 0, 0, time.UTC)
	}

	col, err := app.FindCollectionByNameOrId("deadlines")
	if err != nil {
		log.Printf("[AUTOMATION] Failed to find deadlines collection: %v", err)
		return
	}
	record := core.NewRecord(col)
	record.Set("week_number", weekNumber)
	record.Set("deadline_time", deadlineTime.UTC().Format(time.RFC3339))
	record.Set("is_closed", false)
	if err := app.Save(record); err != nil {
		log.Printf("[AUTOMATION] Failed to save deadline: %v", err)
		return
	}
	log.Printf("[AUTOMATION] Created deadline for week %d: %s", weekNumber, deadlineTime.UTC().Format(time.RFC3339))
}

func autoAssignPicks(app core.App, weekNumber int) {
	allTeams, err := app.FindRecordsByFilter("teams", "id != ''", "team_name", 0, 0)
	if err != nil {
		log.Printf("[AUTOMATION] Failed to load teams: %v", err)
		return
	}
	allUsers, err := app.FindRecordsByFilter("users", "id != ''", "", 0, 0)
	if err != nil {
		log.Printf("[AUTOMATION] Failed to load users: %v", err)
		return
	}
	allWinnerRecords, _ := app.FindRecordsByFilter("winning_teams", "id != ''", "", 0, 0)

	picksCol, err := app.FindCollectionByNameOrId("picks")
	if err != nil {
		log.Printf("[AUTOMATION] Failed to find picks collection: %v", err)
		return
	}

	// Convert teams to gamelogic.Team
	glTeams := make([]gamelogic.Team, len(allTeams))
	for i, t := range allTeams {
		glTeams[i] = gamelogic.Team{
			ID:       t.Id,
			TeamName: t.GetString("team_name"),
		}
	}

	// Convert winners to gamelogic.Winner
	glWinners := make([]gamelogic.Winner, len(allWinnerRecords))
	for i, w := range allWinnerRecords {
		glWinners[i] = gamelogic.Winner{
			TeamID:     w.GetString("team_id"),
			WeekNumber: int(w.GetFloat("week_number")),
		}
	}

	count := 0
	for _, user := range allUsers {
		uid := user.Id

		// Skip if pick already exists for this week
		existing, _ := app.FindRecordsByFilter(
			"picks",
			"user_id = '"+uid+"' && week_number = "+strconv.Itoa(weekNumber),
			"", 1, 0,
		)
		if len(existing) > 0 {
			continue
		}

		// Get all picks for this user
		userPickRecords, _ := app.FindRecordsByFilter("picks", "user_id = '"+uid+"'", "", 0, 0)
		glPicks := make([]gamelogic.Pick, len(userPickRecords))
		for i, p := range userPickRecords {
			glPicks[i] = gamelogic.Pick{
				TeamID:     p.GetString("team_id"),
				WeekNumber: int(p.GetFloat("week_number")),
			}
		}

		// Skip eliminated users
		if gamelogic.IsUserEliminated(glPicks, glWinners, weekNumber) {
			continue
		}

		// Get used team IDs
		usedIDs := make([]string, len(glPicks))
		for i, p := range glPicks {
			usedIDs[i] = p.TeamID
		}

		available := gamelogic.GetFirstAvailableTeam(usedIDs, glTeams)
		if available == nil {
			log.Printf("[AUTOMATION] No teams for user %s", uid)
			continue
		}

		pick := core.NewRecord(picksCol)
		pick.Set("user_id", uid)
		pick.Set("team_id", available.ID)
		pick.Set("week_number", weekNumber)
		if err := app.Save(pick); err != nil {
			log.Printf("[AUTOMATION] Failed to save pick: %v", err)
			continue
		}
		count++
	}
	log.Printf("[AUTOMATION] Auto-assigned %d picks for week %d", count, weekNumber)
}

func ensureNextWeekReady(app core.App, currentWeek int, season string) {
	nextWeek := currentWeek + 1
	existing, _ := app.FindRecordsByFilter("deadlines", "week_number = "+strconv.Itoa(nextWeek), "", 1, 0)
	if len(existing) == 0 {
		createDeadline(app, nextWeek, season)
	}
	autoAssignPicks(app, nextWeek)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd backend && go build ./hooks/`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/hooks/gameweek.go
git commit -m "feat: add gameweek cron hook — ports full JS automation to Go"
```

---

### Task 12: Wire main.go — Connect Hooks + Migrations

**Files:**
- Modify: `backend/main.go`

- [ ] **Step 1: Update main.go to register hooks and migrations**

Replace `backend/main.go` with:
```go
package main

import (
	"log"
	"os"
	"strings"

	"github.com/bajcula/last-man-standing/backend/hooks"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	_ "github.com/bajcula/last-man-standing/backend/migrations"
)

func main() {
	app := pocketbase.New()

	// Enable auto-migration during development (go run)
	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	// Register cron hooks
	hooks.RegisterGameweekCron(app)

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 2: Verify full project compiles**

Run: `cd backend && go build -o /dev/null .`
Expected: no errors

- [ ] **Step 3: Run all tests**

Run: `cd backend && go test ./... -v`
Expected: PASS — all gamelogic and services tests

- [ ] **Step 4: Commit**

```bash
git add backend/main.go
git commit -m "feat: wire hooks and migrations into main.go"
```

---

### Task 13: Dockerfile + docker-compose.yml

**Files:**
- Create: `backend/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Create `backend/Dockerfile`**

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
WORKDIR /pb
EXPOSE 8090
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
```

- [ ] **Step 2: Update `docker-compose.yml`**

Replace the full file with:
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

- [ ] **Step 3: Add `backend/pocketbase` to `.gitignore`**

Append to `.gitignore` (or create if it doesn't exist):
```
# Go build output
backend/pocketbase
```

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile docker-compose.yml .gitignore
git commit -m "feat: add Go backend Dockerfile and update docker-compose"
```

---

### Task 14: Docker Build + Smoke Test

**Files:** none (validation only)

- [ ] **Step 1: Build Docker images**

Run: `docker compose build`
Expected: Both images build successfully. Go backend compiles in builder stage.

- [ ] **Step 2: Start containers**

Run: `docker compose up -d`
Expected: Both containers start. Check with `docker compose ps` — both should show "running".

- [ ] **Step 3: Verify PocketBase is serving**

Run: `curl -s http://localhost:8090/api/health | head -20`
Expected: JSON response with `{"code":200,"message":"API is healthy."}` or similar.

- [ ] **Step 4: Verify migrations ran (collections exist)**

Run: `curl -s http://localhost:8090/api/collections | python3 -c "import sys,json; items=json.load(sys.stdin).get('items',[]); [print(c['name']) for c in items]"`
Expected: Output includes `teams`, `picks`, `deadlines`, `winning_teams`

- [ ] **Step 5: Verify seed data (20 teams)**

Run: `curl -s "http://localhost:8090/api/collections/teams/records" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{d[\"totalItems\"]} teams')"`
Expected: `20 teams`

- [ ] **Step 6: Stop containers**

Run: `docker compose down`

- [ ] **Step 7: Commit (no file changes, but verify clean state)**

Run: `cd backend && go test ./... -v` to ensure tests still pass.

---

### Task 15: Update railway.json + .env.example + Cleanup

**Files:**
- Modify: `railway.json`
- Modify: `.env.example`

- [ ] **Step 1: Update `railway.json`**

Replace the full file with:
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

- [ ] **Step 2: Update `.env.example`**

Ensure it includes:
```
POCKETBASE_URL=https://your-instance.example.com
ADMIN_EMAIL=your-email@example.com
ADMIN_PASSWORD=your-secure-password
VITE_POCKETBASE_URL=https://your-instance.example.com
```

- [ ] **Step 3: Commit**

```bash
git add railway.json .env.example
git commit -m "feat: update railway.json for Go backend deployment"
```

---

### Task 16: Remove Old pocketbase/ Directory

**Files:**
- Delete: `pocketbase/` directory (all JS hooks, migrations, Dockerfile)

**Prerequisite:** Tasks 1–15 are complete and Docker smoke test passes.

- [ ] **Step 1: Verify Go backend works end-to-end**

Confirm Docker build succeeded (Task 14) and all tests pass.

- [ ] **Step 2: Delete old pocketbase/ directory**

```bash
git rm -r pocketbase/
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove old JS-based pocketbase directory

Replaced by custom Go app in backend/. All hooks, migrations,
and Dockerfile have been ported to Go."
```

---

### Task 17: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (project root)

- [ ] **Step 1: Update stale references in CLAUDE.md**

Key changes:
- Backend hosting: PocketHost → Railway
- Backend path: `pocketbase/` → `backend/`
- Deadline fields: `deadline_date` + `deadline_time` + `status` → `deadline_time` + `is_closed`
- Dev workflow: `cd pocketbase && ./pocketbase serve` → `cd backend && go run . serve`
- Testing: add `cd backend && go test ./...`
- PocketBase version: 0.22.22 → 0.36.7
- Migrations: JS → Go

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Go backend migration"
```

---

## Summary

| Task | Description | Est. Steps |
|------|-------------|-----------|
| 1 | Project scaffold (go.mod, main.go) | 5 |
| 2 | GetMatchWinner (TDD) | 5 |
| 3 | IsUserEliminated (TDD) | 6 |
| 4 | GetFirstAvailableTeam (TDD) | 5 |
| 5 | GetCurrentSeason + CalculateDeadline (TDD) | 6 |
| 6 | Services types + constants | 3 |
| 7 | FindTeamByApiName + polling window tests | 3 |
| 8 | ParseScore helper (TDD) | 6 |
| 9 | Schema migration | 3 |
| 10 | Seed migration | 3 |
| 11 | Cron hook (gameweek.go) | 3 |
| 12 | Wire main.go | 4 |
| 13 | Dockerfile + docker-compose | 3 |
| 14 | Docker build + smoke test | 7 |
| 15 | railway.json + .env.example | 3 |
| 16 | Remove old pocketbase/ | 3 |
| 17 | Update CLAUDE.md | 2 |
| **Total** | | **70 steps** |
