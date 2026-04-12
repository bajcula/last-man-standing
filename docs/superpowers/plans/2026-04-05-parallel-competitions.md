# Parallel Competitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add support for multiple simultaneous competitions so admin can start new rounds while existing competitions continue.

**Architecture:** New `competitions` and `competition_participants` collections. Add `competition_id` FK to picks, deadlines, winning_teams. All backend logic (cron, picks guard) scoped by competition. Frontend uses React context for selected competition with a switcher UI.

**Tech Stack:** Go / PocketBase v0.36.7, React 19 / Vite / TypeScript, PocketBase JS SDK

---

## File Structure

**New files:**
- `backend/migrations/004_competitions.go` — schema migration + backfill
- `backend/hooks/competition_routes.go` — admin CRUD endpoints for competitions
- `frontend/src/contexts/CompetitionContext.tsx` — React context for selected competition
- `frontend/src/components/CompetitionSwitcher.tsx` — dropdown/tab switcher
- `frontend/src/components/admin/CompetitionManagement.tsx` — start/end competition UI

**Modified files:**
- `backend/main.go` — wire competition routes
- `backend/hooks/gameweek.go` — scope automation by competition_id
- `backend/hooks/picks_guard.go` — scope deadline/elimination checks by competition_id
- `backend/hooks/dev_routes.go` — minor: ensure advance works with competitions
- `frontend/src/types/index.ts` — add Competition, CompetitionParticipant types
- `frontend/src/App.tsx` — wrap with CompetitionProvider
- `frontend/src/components/PickTeam.tsx` — filter by selected competition
- `frontend/src/components/MyPicks.tsx` — filter by selected competition
- `frontend/src/components/AllPlayersPicksHistory.tsx` — filter by competition + past competitions dropdown
- `frontend/src/components/Admin.tsx` — add Competitions tab
- `frontend/src/App.css` — styles for switcher, competition management

---

### Task 1: Migration — Create collections and backfill

**Files:**
- Create: `backend/migrations/004_competitions.go`

- [ ] **Step 1: Write the migration file**

```go
// backend/migrations/004_competitions.go
package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		authRule := types.Pointer(`@request.auth.id != ""`)
		adminRule := types.Pointer(`@request.auth.isAdmin = true`)

		// --- competitions ---
		competitions := core.NewBaseCollection("competitions")
		competitions.ListRule = authRule
		competitions.ViewRule = authRule
		competitions.CreateRule = adminRule
		competitions.UpdateRule = adminRule
		competitions.DeleteRule = adminRule
		competitions.Fields.Add(
			&core.TextField{Name: "name", Required: true},
			&core.SelectField{
				Name:     "status",
				Required: true,
				Values:   []string{"active", "ended"},
			},
			&core.NumberField{Name: "start_week", Required: true},
			&core.NumberField{Name: "end_week"},
			&core.RelationField{
				Name:         "created_by",
				CollectionId: "_pb_users_auth_",
				MaxSelect:    1,
			},
		)
		if err := app.Save(competitions); err != nil {
			return err
		}

		// --- competition_participants ---
		participants := core.NewBaseCollection("competition_participants")
		participants.ListRule = authRule
		participants.ViewRule = authRule
		participants.CreateRule = adminRule
		participants.UpdateRule = adminRule
		participants.DeleteRule = adminRule
		participants.Fields.Add(
			&core.RelationField{
				Name:         "competition_id",
				CollectionId: competitions.Id,
				MaxSelect:    1,
				Required:     true,
			},
			&core.RelationField{
				Name:         "user_id",
				CollectionId: "_pb_users_auth_",
				MaxSelect:    1,
				Required:     true,
			},
			&core.BoolField{Name: "is_eliminated"},
		)
		if err := app.Save(participants); err != nil {
			return err
		}

		// --- Add competition_id to picks ---
		picks, err := app.FindCollectionByNameOrId("picks")
		if err != nil {
			return err
		}
		picks.Fields.Add(&core.RelationField{
			Name:         "competition_id",
			CollectionId: competitions.Id,
			MaxSelect:    1,
		})
		if err := app.Save(picks); err != nil {
			return err
		}

		// --- Add competition_id to deadlines ---
		deadlines, err := app.FindCollectionByNameOrId("deadlines")
		if err != nil {
			return err
		}
		deadlines.Fields.Add(&core.RelationField{
			Name:         "competition_id",
			CollectionId: competitions.Id,
			MaxSelect:    1,
		})
		if err := app.Save(deadlines); err != nil {
			return err
		}

		// --- Add competition_id to winning_teams ---
		winningTeams, err := app.FindCollectionByNameOrId("winning_teams")
		if err != nil {
			return err
		}
		winningTeams.Fields.Add(&core.RelationField{
			Name:         "competition_id",
			CollectionId: competitions.Id,
			MaxSelect:    1,
		})
		if err := app.Save(winningTeams); err != nil {
			return err
		}

		// --- Backfill: Create "Round 1" competition ---
		admins, _ := app.FindRecordsByFilter("users", "isAdmin = true", "", 1, 0)

		compRecord := core.NewRecord(competitions)
		compRecord.Set("name", "Round 1")
		compRecord.Set("status", "active")
		compRecord.Set("start_week", 1)
		if len(admins) > 0 {
			compRecord.Set("created_by", admins[0].Id)
		}
		if err := app.Save(compRecord); err != nil {
			return err
		}
		compID := compRecord.Id

		// Backfill existing picks
		allPicks, _ := app.FindRecordsByFilter("picks", "id != ''", "", 0, 0)
		for _, p := range allPicks {
			p.Set("competition_id", compID)
			if err := app.Save(p); err != nil {
				log.Printf("[MIGRATION] Failed to backfill pick %s: %v", p.Id, err)
			}
		}

		// Backfill existing deadlines
		allDeadlines, _ := app.FindRecordsByFilter("deadlines", "id != ''", "", 0, 0)
		for _, d := range allDeadlines {
			d.Set("competition_id", compID)
			if err := app.Save(d); err != nil {
				log.Printf("[MIGRATION] Failed to backfill deadline %s: %v", d.Id, err)
			}
		}

		// Backfill existing winning_teams
		allWinners, _ := app.FindRecordsByFilter("winning_teams", "id != ''", "", 0, 0)
		for _, w := range allWinners {
			w.Set("competition_id", compID)
			if err := app.Save(w); err != nil {
				log.Printf("[MIGRATION] Failed to backfill winner %s: %v", w.Id, err)
			}
		}

		// Add all existing users as participants
		allUsers, _ := app.FindRecordsByFilter("users", "id != ''", "", 0, 0)
		for _, u := range allUsers {
			participant := core.NewRecord(participants)
			participant.Set("competition_id", compID)
			participant.Set("user_id", u.Id)
			participant.Set("is_eliminated", false)
			if err := app.Save(participant); err != nil {
				log.Printf("[MIGRATION] Failed to add participant %s: %v", u.Id, err)
			}
		}

		return nil
	}, func(app core.App) error {
		// Down: drop new collections (cascade removes relation fields)
		for _, name := range []string{"competition_participants", "competitions"} {
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

- [ ] **Step 2: Verify migration compiles**

Run: `cd backend && go build ./...`
Expected: No errors

- [ ] **Step 3: Verify migration runs**

Run: `cd backend && go run . migrate up`
Expected: Migration applies successfully, "Round 1" competition created

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/004_competitions.go
git commit -m "feat: migration for competitions schema and backfill"
```

---

### Task 2: Competition admin routes

**Files:**
- Create: `backend/hooks/competition_routes.go`
- Modify: `backend/main.go:40-41`

- [ ] **Step 1: Write competition_routes.go**

```go
// backend/hooks/competition_routes.go
package hooks

import (
	"net/http"

	"github.com/pocketbase/pocketbase/core"
)

// RegisterCompetitionRoutes adds admin-only endpoints for managing competitions.
func RegisterCompetitionRoutes(app core.App) {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {

		// POST /api/competitions — create a new competition
		se.Router.POST("/api/competitions", func(e *core.RequestEvent) error {
			auth := e.Auth
			if auth == nil || !auth.GetBool("isAdmin") {
				return e.ForbiddenError("Admin only", nil)
			}

			var body struct {
				Name           string   `json:"name"`
				ParticipantIDs []string `json:"participant_ids"`
			}
			if err := e.BindBody(&body); err != nil {
				return e.BadRequestError("Invalid body", err)
			}
			if body.Name == "" {
				return e.BadRequestError("Name is required", nil)
			}
			if len(body.ParticipantIDs) == 0 {
				return e.BadRequestError("At least one participant is required", nil)
			}

			// Determine start_week: next week after the highest deadline across all active competitions
			startWeek := 1
			deadlines, err := app.FindRecordsByFilter("deadlines", "id != ''", "-week_number", 1, 0)
			if err == nil && len(deadlines) > 0 {
				startWeek = deadlines[0].GetInt("week_number") + 1
			}

			compCol, err := app.FindCollectionByNameOrId("competitions")
			if err != nil {
				return e.InternalServerError("Failed to find competitions collection", err)
			}

			comp := core.NewRecord(compCol)
			comp.Set("name", body.Name)
			comp.Set("status", "active")
			comp.Set("start_week", startWeek)
			comp.Set("created_by", auth.Id)
			if err := app.Save(comp); err != nil {
				return e.InternalServerError("Failed to create competition", err)
			}

			// Add participants
			partCol, err := app.FindCollectionByNameOrId("competition_participants")
			if err != nil {
				return e.InternalServerError("Failed to find participants collection", err)
			}

			added := 0
			for _, uid := range body.ParticipantIDs {
				p := core.NewRecord(partCol)
				p.Set("competition_id", comp.Id)
				p.Set("user_id", uid)
				p.Set("is_eliminated", false)
				if err := app.Save(p); err == nil {
					added++
				}
			}

			return e.JSON(http.StatusOK, map[string]any{
				"id":           comp.Id,
				"name":         body.Name,
				"start_week":   startWeek,
				"participants":  added,
			})
		})

		// POST /api/competitions/:id/end — end a competition
		se.Router.POST("/api/competitions/{id}/end", func(e *core.RequestEvent) error {
			auth := e.Auth
			if auth == nil || !auth.GetBool("isAdmin") {
				return e.ForbiddenError("Admin only", nil)
			}

			compID := e.Request.PathValue("id")
			comp, err := app.FindRecordById("competitions", compID)
			if err != nil {
				return e.NotFoundError("Competition not found", err)
			}

			if comp.GetString("status") == "ended" {
				return e.BadRequestError("Competition is already ended", nil)
			}

			// Find the current week for this competition
			endWeek := comp.GetInt("start_week")
			deadlines, err := app.FindRecordsByFilter(
				"deadlines",
				"competition_id = {:compID}",
				"-week_number", 1, 0,
				map[string]any{"compID": compID},
			)
			if err == nil && len(deadlines) > 0 {
				endWeek = deadlines[0].GetInt("week_number")
			}

			comp.Set("status", "ended")
			comp.Set("end_week", endWeek)
			if err := app.Save(comp); err != nil {
				return e.InternalServerError("Failed to end competition", err)
			}

			return e.JSON(http.StatusOK, map[string]any{
				"id":       compID,
				"status":   "ended",
				"end_week": endWeek,
			})
		})

		return se.Next()
	})
}
```

- [ ] **Step 2: Wire routes in main.go**

Add `hooks.RegisterCompetitionRoutes(app)` after line 41 in `backend/main.go`:

```go
	hooks.RegisterGameweekCron(app, fetcher)
	hooks.RegisterPicksGuard(app)
	hooks.RegisterCompetitionRoutes(app)
```

- [ ] **Step 3: Verify compilation**

Run: `cd backend && go build ./...`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/hooks/competition_routes.go backend/main.go
git commit -m "feat: admin endpoints for creating and ending competitions"
```

---

### Task 3: Scope gameweek cron by competition

**Files:**
- Modify: `backend/hooks/gameweek.go`

This is the largest backend change. Every function gains a `competitionID` parameter. `RunGameweekAutomation` loops over active competitions.

- [ ] **Step 1: Rewrite gameweek.go with competition scoping**

Replace the entire file with:

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

func RegisterGameweekCron(app core.App, fetcher services.MatchFetcher) {
	app.Cron().MustAdd("gameweek-automation", "*/30 * * * *", func() {
		RunGameweekAutomation(app, fetcher)
	})
}

func RunGameweekAutomation(app core.App, fetcher services.MatchFetcher) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[AUTOMATION] Panic recovered: %v", r)
		}
	}()

	competitions, err := app.FindRecordsByFilter("competitions", "status = 'active'", "", 0, 0)
	if err != nil || len(competitions) == 0 {
		log.Println("[AUTOMATION] No active competitions found")
		return
	}

	for _, comp := range competitions {
		runCompetitionAutomation(app, fetcher, comp.Id, comp.GetInt("start_week"))
	}
}

func runCompetitionAutomation(app core.App, fetcher services.MatchFetcher, competitionID string, startWeek int) {
	hasDeadlines := false
	existing, _ := app.FindRecordsByFilter(
		"deadlines",
		"competition_id = {:compID}",
		"", 1, 0,
		map[string]any{"compID": competitionID},
	)
	if len(existing) > 0 {
		hasDeadlines = true
	}

	now := time.Now().UTC()
	season := gamelogic.GetCurrentSeason(now)

	if !hasDeadlines {
		log.Printf("[AUTOMATION] Competition %s: first run - initializing at week %d", competitionID, startWeek)
		createDeadline(app, startWeek, season, fetcher, competitionID)
		autoAssignPicks(app, startWeek, competitionID)
		log.Printf("[AUTOMATION] Competition %s: initial setup complete", competitionID)
		return
	}

	currentWeek := getCurrentWeek(app, competitionID, startWeek)
	log.Printf("[AUTOMATION] Competition %s: tick - week %d", competitionID, currentWeek)

	if weekAlreadyProcessed(app, currentWeek, competitionID) {
		log.Printf("[AUTOMATION] Competition %s: week %d done. Ensuring next week ready.", competitionID, currentWeek)
		ensureNextWeekReady(app, currentWeek, season, fetcher, competitionID)
		return
	}

	matches, err := fetcher.FetchRoundMatches(season, currentWeek)
	if err != nil {
		log.Printf("[AUTOMATION] Competition %s: fetch failed: %v", competitionID, err)
		return
	}
	if len(matches) == 0 {
		log.Printf("[AUTOMATION] Competition %s: no matches for week %d", competitionID, currentWeek)
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
		} else {
			allResolved = false
		}
	}

	if allResolved {
		log.Printf("[AUTOMATION] Competition %s: all resolved (%d finished, %d skipped). Processing week %d", competitionID, doneCount, skippedCount, currentWeek)
		markWinners(app, currentWeek, matches, competitionID)
		ensureNextWeekReady(app, currentWeek, season, fetcher, competitionID)
		return
	}

	active, reason := services.GetPollingWindow(matches, now)
	if !active {
		log.Printf("[AUTOMATION] Competition %s: skipping - %s", competitionID, reason)
		return
	}

	log.Printf("[AUTOMATION] Competition %s: %d/%d finished, %d skipped. Waiting.", competitionID, doneCount, len(matches), skippedCount)
}

func getCurrentWeek(app core.App, competitionID string, startWeek int) int {
	records, err := app.FindRecordsByFilter(
		"deadlines",
		"competition_id = {:compID}",
		"-week_number", 1, 0,
		map[string]any{"compID": competitionID},
	)
	if err != nil || len(records) == 0 {
		return startWeek
	}
	return records[0].GetInt("week_number")
}

func weekAlreadyProcessed(app core.App, week int, competitionID string) bool {
	records, err := app.FindRecordsByFilter(
		"winning_teams",
		"week_number = {:week} && competition_id = {:compID}",
		"", 1, 0,
		map[string]any{"week": week, "compID": competitionID},
	)
	if err != nil {
		return false
	}
	return len(records) > 0
}

func markWinners(app core.App, weekNumber int, matches []services.APIMatch, competitionID string) {
	allTeams, err := app.FindRecordsByFilter("teams", "id != ''", "", 0, 0)
	if err != nil {
		log.Printf("[AUTOMATION] Failed to load teams: %v", err)
		return
	}
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
		existing, _ := app.FindRecordsByFilter(
			"winning_teams",
			"week_number = {:week} && team_id = {:teamID} && competition_id = {:compID}",
			"", 1, 0,
			map[string]any{"week": weekNumber, "teamID": dbTeam.ID, "compID": competitionID},
		)
		if len(existing) > 0 {
			continue
		}
		record := core.NewRecord(col)
		record.Set("week_number", weekNumber)
		record.Set("team_id", dbTeam.ID)
		record.Set("competition_id", competitionID)
		if err := app.Save(record); err != nil {
			log.Printf("[AUTOMATION] Failed to save winner: %v", err)
			continue
		}
		count++
	}
	log.Printf("[AUTOMATION] Marked %d winners for week %d (competition %s)", count, weekNumber, competitionID)
}

func createDeadline(app core.App, weekNumber int, season string, fetcher services.MatchFetcher, competitionID string) {
	existing, _ := app.FindRecordsByFilter(
		"deadlines",
		"week_number = {:week} && competition_id = {:compID}",
		"", 1, 0,
		map[string]any{"week": weekNumber, "compID": competitionID},
	)
	if len(existing) > 0 {
		log.Printf("[AUTOMATION] Deadline for week %d (competition %s) already exists, skipping.", weekNumber, competitionID)
		return
	}
	now := time.Now().UTC()
	var deadlineTime time.Time
	matches, err := fetcher.FetchRoundMatches(season, weekNumber)
	if err != nil {
		log.Printf("[AUTOMATION] Could not fetch week %d for deadline: %v", weekNumber, err)
	}
	if len(matches) > 0 {
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
	record.Set("competition_id", competitionID)
	if err := app.Save(record); err != nil {
		log.Printf("[AUTOMATION] Failed to save deadline: %v", err)
		return
	}
	log.Printf("[AUTOMATION] Created deadline for week %d (competition %s): %s", weekNumber, competitionID, deadlineTime.UTC().Format(time.RFC3339))
}

func autoAssignPicks(app core.App, weekNumber int, competitionID string) {
	allTeams, err := app.FindRecordsByFilter("teams", "id != ''", "team_name", 0, 0)
	if err != nil {
		log.Printf("[AUTOMATION] Failed to load teams: %v", err)
		return
	}

	// Load only participants for this competition
	participantRecords, err := app.FindRecordsByFilter(
		"competition_participants",
		"competition_id = {:compID}",
		"", 0, 0,
		map[string]any{"compID": competitionID},
	)
	if err != nil {
		log.Printf("[AUTOMATION] Failed to load participants: %v", err)
		return
	}

	// Load winners scoped to this competition
	allWinnerRecords, _ := app.FindRecordsByFilter(
		"winning_teams",
		"competition_id = {:compID}",
		"", 0, 0,
		map[string]any{"compID": competitionID},
	)
	picksCol, err := app.FindCollectionByNameOrId("picks")
	if err != nil {
		log.Printf("[AUTOMATION] Failed to find picks collection: %v", err)
		return
	}
	glTeams := make([]gamelogic.Team, len(allTeams))
	for i, t := range allTeams {
		glTeams[i] = gamelogic.Team{
			ID:       t.Id,
			TeamName: t.GetString("team_name"),
		}
	}
	glWinners := make([]gamelogic.Winner, len(allWinnerRecords))
	for i, w := range allWinnerRecords {
		glWinners[i] = gamelogic.Winner{
			TeamID:     w.GetString("team_id"),
			WeekNumber: w.GetInt("week_number"),
		}
	}
	count := 0
	for _, participant := range participantRecords {
		uid := participant.GetString("user_id")

		// Check if pick already exists for this week+competition
		existing, _ := app.FindRecordsByFilter(
			"picks",
			"user_id = {:uid} && week_number = {:week} && competition_id = {:compID}",
			"", 1, 0,
			map[string]any{"uid": uid, "week": weekNumber, "compID": competitionID},
		)
		if len(existing) > 0 {
			continue
		}

		// Load picks scoped to this competition only
		userPickRecords, _ := app.FindRecordsByFilter(
			"picks",
			"user_id = {:uid} && competition_id = {:compID}",
			"", 0, 0,
			map[string]any{"uid": uid, "compID": competitionID},
		)
		glPicks := make([]gamelogic.Pick, len(userPickRecords))
		for i, p := range userPickRecords {
			glPicks[i] = gamelogic.Pick{
				TeamID:     p.GetString("team_id"),
				WeekNumber: p.GetInt("week_number"),
			}
		}
		if gamelogic.IsUserEliminated(glPicks, glWinners, weekNumber) {
			continue
		}
		usedIDs := make([]string, len(glPicks))
		for i, p := range glPicks {
			usedIDs[i] = p.TeamID
		}
		available := gamelogic.GetFirstAvailableTeam(usedIDs, glTeams)
		if available == nil {
			log.Printf("[AUTOMATION] No teams for user %s in competition %s", uid, competitionID)
			continue
		}
		pick := core.NewRecord(picksCol)
		pick.Set("user_id", uid)
		pick.Set("team_id", available.ID)
		pick.Set("week_number", weekNumber)
		pick.Set("competition_id", competitionID)
		if err := app.Save(pick); err != nil {
			log.Printf("[AUTOMATION] Failed to save pick: %v", err)
			continue
		}
		count++
	}
	log.Printf("[AUTOMATION] Auto-assigned %d picks for week %d (competition %s)", count, weekNumber, competitionID)
}

func ensureNextWeekReady(app core.App, currentWeek int, season string, fetcher services.MatchFetcher, competitionID string) {
	nextWeek := currentWeek + 1
	existing, _ := app.FindRecordsByFilter(
		"deadlines",
		"week_number = "+strconv.Itoa(nextWeek)+" && competition_id = {:compID}",
		"", 1, 0,
		map[string]any{"compID": competitionID},
	)
	if len(existing) == 0 {
		createDeadline(app, nextWeek, season, fetcher, competitionID)
	}
	autoAssignPicks(app, nextWeek, competitionID)
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./...`
Expected: No errors

- [ ] **Step 3: Run existing tests**

Run: `cd backend && go test ./...`
Expected: All tests pass (gamelogic tests are pure functions, unaffected)

- [ ] **Step 4: Commit**

```bash
git add backend/hooks/gameweek.go
git commit -m "feat: scope gameweek cron automation by competition_id"
```

---

### Task 4: Scope picks guard by competition

**Files:**
- Modify: `backend/hooks/picks_guard.go`

- [ ] **Step 1: Rewrite picks_guard.go with competition scoping**

```go
package hooks

import (
	"strconv"
	"time"

	"github.com/bajcula/last-man-standing/backend/gamelogic"
	"github.com/pocketbase/pocketbase/core"
)

func RegisterPicksGuard(app core.App) {
	app.OnRecordCreateRequest("picks").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := enforceDeadline(app, e); err != nil {
			return err
		}
		return e.Next()
	})

	app.OnRecordUpdateRequest("picks").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := enforceDeadline(app, e); err != nil {
			return err
		}
		return e.Next()
	})

	app.OnRecordsListRequest("picks").BindFunc(func(e *core.RecordsListRequestEvent) error {
		auth := e.Auth
		if auth == nil || auth.GetBool("isAdmin") {
			return e.Next()
		}

		now := time.Now().UTC()
		deadlines, err := app.FindRecordsByFilter("deadlines", "id != ''", "", 0, 0)
		if err != nil {
			return e.Next()
		}

		// Key: "competitionID|weekNumber" → true if open
		openWeeks := map[string]bool{}
		for _, d := range deadlines {
			deadlineTime := d.GetDateTime("deadline_time").Time()
			isClosed := d.GetBool("is_closed")
			if !isClosed && deadlineTime.After(now) {
				week := d.GetInt("week_number")
				compID := d.GetString("competition_id")
				openWeeks[compID+"|"+strconv.Itoa(week)] = true
			}
		}

		if len(openWeeks) == 0 {
			return e.Next()
		}

		filtered := make([]*core.Record, 0, len(e.Records))
		for _, r := range e.Records {
			week := r.GetInt("week_number")
			compID := r.GetString("competition_id")
			isOwn := r.GetString("user_id") == auth.Id
			key := compID + "|" + strconv.Itoa(week)
			if isOwn || !openWeeks[key] {
				filtered = append(filtered, r)
			}
		}

		e.Records = filtered
		e.Result.Items = filtered
		e.Result.TotalItems = len(filtered)

		return e.Next()
	})
}

func enforceDeadline(app core.App, e *core.RecordRequestEvent) error {
	auth := e.Auth
	if auth == nil {
		return e.BadRequestError("Authentication required", nil)
	}

	if auth.GetBool("isAdmin") {
		return nil
	}

	weekNum := e.Record.GetInt("week_number")
	if weekNum == 0 {
		return nil
	}

	compID := e.Record.GetString("competition_id")

	// Check elimination first — scoped to this competition
	if compID != "" && isEliminated(app, auth.Id, weekNum, compID) {
		return e.ForbiddenError("You have been eliminated", nil)
	}

	// Check used-team uniqueness within competition
	if compID != "" {
		teamID := e.Record.GetString("team_id")
		if teamID != "" {
			existing, _ := app.FindRecordsByFilter(
				"picks",
				"user_id = {:uid} && team_id = {:teamID} && competition_id = {:compID} && week_number != {:week}",
				"", 1, 0,
				map[string]any{"uid": auth.Id, "teamID": teamID, "compID": compID, "week": weekNum},
			)
			if len(existing) > 0 {
				return e.ForbiddenError("You already used this team in this competition", nil)
			}
		}
	}

	// Deadline check — scoped to competition
	var deadlines []*core.Record
	var err error
	if compID != "" {
		deadlines, err = app.FindRecordsByFilter(
			"deadlines",
			"week_number = {:week} && competition_id = {:compID}",
			"", 1, 0,
			map[string]any{"week": weekNum, "compID": compID},
		)
	} else {
		deadlines, err = app.FindRecordsByFilter(
			"deadlines",
			"week_number = {:week}",
			"", 1, 0,
			map[string]any{"week": weekNum},
		)
	}
	if err != nil || len(deadlines) == 0 {
		return nil
	}

	d := deadlines[0]
	deadlineTime := d.GetDateTime("deadline_time").Time()
	isClosed := d.GetBool("is_closed")

	if isClosed || time.Now().UTC().After(deadlineTime) {
		return e.ForbiddenError("Deadline has passed — picks are locked", nil)
	}

	return nil
}

func isEliminated(app core.App, userID string, currentWeek int, competitionID string) bool {
	userPicks, _ := app.FindRecordsByFilter(
		"picks",
		"user_id = {:uid} && competition_id = {:compID}",
		"", 0, 0,
		map[string]any{"uid": userID, "compID": competitionID},
	)
	allWinners, _ := app.FindRecordsByFilter(
		"winning_teams",
		"competition_id = {:compID}",
		"", 0, 0,
		map[string]any{"compID": competitionID},
	)

	glPicks := make([]gamelogic.Pick, len(userPicks))
	for i, p := range userPicks {
		glPicks[i] = gamelogic.Pick{
			TeamID:     p.GetString("team_id"),
			WeekNumber: p.GetInt("week_number"),
		}
	}
	glWinners := make([]gamelogic.Winner, len(allWinners))
	for i, w := range allWinners {
		glWinners[i] = gamelogic.Winner{
			TeamID:     w.GetString("team_id"),
			WeekNumber: w.GetInt("week_number"),
		}
	}

	return gamelogic.IsUserEliminated(glPicks, glWinners, currentWeek)
}
```

- [ ] **Step 2: Update dev_routes.go closeDeadline to scope by competition**

In `backend/hooks/dev_routes.go`, the `closeDeadline` function already uses a filter. No change needed — it closes by week_number which is fine since mock mode only has one competition. The advance endpoint calls `RunGameweekAutomation` which now loops over active competitions automatically.

- [ ] **Step 3: Verify compilation**

Run: `cd backend && go build ./...`
Expected: No errors

- [ ] **Step 4: Run tests**

Run: `cd backend && go test ./...`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/hooks/picks_guard.go
git commit -m "feat: scope picks guard by competition_id with used-team validation"
```

---

### Task 5: Frontend types and Competition context

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/contexts/CompetitionContext.tsx`

- [ ] **Step 1: Add types to frontend/src/types/index.ts**

Append after the `WinningTeam` interface (after line 37):

```typescript
export interface Competition extends RecordModel {
  name: string;
  status: 'active' | 'ended';
  start_week: number;
  end_week: number | null;
  created_by: string;
}

export interface CompetitionParticipant extends RecordModel {
  competition_id: string;
  user_id: string;
  is_eliminated: boolean;
}
```

Add `competition_id` to Pick (line 20) and Deadline (line 29):

In Pick interface, add `competition_id: string;` after `week_number`.
In Deadline interface, add `competition_id: string;` after `is_closed`.

- [ ] **Step 2: Create CompetitionContext**

```tsx
// frontend/src/contexts/CompetitionContext.tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { pb } from '../lib/pocketbase';
import type { Competition, CompetitionParticipant } from '../types';

interface CompetitionContextType {
  competitions: Competition[];
  selectedCompetition: Competition | null;
  setSelectedCompetition: (comp: Competition) => void;
  loading: boolean;
  reload: () => Promise<void>;
}

const CompetitionContext = createContext<CompetitionContextType>({
  competitions: [],
  selectedCompetition: null,
  setSelectedCompetition: () => {},
  loading: true,
  reload: async () => {},
});

export function CompetitionProvider({ children }: { children: ReactNode }) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const userId = pb.authStore.model?.id;
      if (!userId) {
        setLoading(false);
        return;
      }

      const isAdmin = (pb.authStore.model as any)?.isAdmin;

      let comps: Competition[];
      if (isAdmin) {
        // Admins see all competitions
        comps = await pb.collection('competitions').getFullList({
          sort: '-created',
        }) as unknown as Competition[];
      } else {
        // Non-admins: only competitions they participate in
        const participations = await pb.collection('competition_participants').getFullList({
          filter: `user_id = "${userId}"`,
        }) as unknown as CompetitionParticipant[];

        const compIds = participations.map(p => p.competition_id);
        if (compIds.length === 0) {
          setCompetitions([]);
          setSelectedCompetition(null);
          setLoading(false);
          return;
        }

        const filter = compIds.map(id => `id = "${id}"`).join(' || ');
        comps = await pb.collection('competitions').getFullList({
          filter,
          sort: '-created',
        }) as unknown as Competition[];
      }

      // Sort: active first, then by created desc
      comps.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return 0;
      });

      setCompetitions(comps);

      // Auto-select first active, or keep current selection if valid
      if (!selectedCompetition || !comps.find(c => c.id === selectedCompetition.id)) {
        const firstActive = comps.find(c => c.status === 'active');
        setSelectedCompetition(firstActive || comps[0] || null);
      }
    } catch (err) {
      console.error('Failed to load competitions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [pb.authStore.model?.id]);

  return (
    <CompetitionContext.Provider value={{
      competitions,
      selectedCompetition,
      setSelectedCompetition,
      loading,
      reload: load,
    }}>
      {children}
    </CompetitionContext.Provider>
  );
}

export const useCompetition = () => useContext(CompetitionContext);
```

- [ ] **Step 3: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/contexts/CompetitionContext.tsx
git commit -m "feat: Competition types and React context"
```

---

### Task 6: Competition switcher and App.tsx integration

**Files:**
- Create: `frontend/src/components/CompetitionSwitcher.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create CompetitionSwitcher component**

```tsx
// frontend/src/components/CompetitionSwitcher.tsx
import { useCompetition } from '../contexts/CompetitionContext';

function CompetitionSwitcher() {
  const { competitions, selectedCompetition, setSelectedCompetition, loading } = useCompetition();

  if (loading) return null;

  const activeComps = competitions.filter(c => c.status === 'active');

  // Don't show switcher if there's only one active competition
  if (activeComps.length <= 1 && competitions.every(c => c.status === 'active')) {
    return null;
  }

  return (
    <div className="competition-switcher">
      <select
        value={selectedCompetition?.id || ''}
        onChange={(e) => {
          const comp = competitions.find(c => c.id === e.target.value);
          if (comp) setSelectedCompetition(comp);
        }}
      >
        {activeComps.length > 0 && (
          <optgroup label="Active">
            {activeComps.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        )}
        {competitions.filter(c => c.status === 'ended').length > 0 && (
          <optgroup label="Ended">
            {competitions.filter(c => c.status === 'ended').map(c => (
              <option key={c.id} value={c.id}>
                {c.name} (Weeks {c.start_week}–{c.end_week})
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

export default CompetitionSwitcher;
```

- [ ] **Step 2: Wrap App.tsx with CompetitionProvider and add switcher**

In `frontend/src/App.tsx`:

1. Add imports:
```tsx
import { CompetitionProvider } from './contexts/CompetitionContext';
import CompetitionSwitcher from './components/CompetitionSwitcher';
```

2. Wrap the Router content with CompetitionProvider and add CompetitionSwitcher after NavBar:
```tsx
  return (
    <Router>
      <CompetitionProvider>
        <div>
          <NavBar user={user} logout={logout} />
          <CompetitionSwitcher />

          <div className="container">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Navigate to="/pick" />} />
                <Route path="/pick" element={<PickTeam />} />
                <Route path="/my-picks" element={<MyPicks />} />
                <Route path="/history" element={<AllPlayersPicksHistory />} />
                <Route path="/admin" element={user.isAdmin ? <Admin /> : <Navigate to="/pick" />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </div>
      </CompetitionProvider>
    </Router>
  );
```

- [ ] **Step 3: Add CSS for competition switcher**

Append to `frontend/src/App.css`:

```css
/* Competition Switcher */
.competition-switcher {
  max-width: 1200px;
  margin: 0 auto;
  padding: 10px 20px 0;
}

.competition-switcher select {
  width: 100%;
  padding: 10px 15px;
  border-radius: 8px;
  border: 2px solid var(--color-primary);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
```

- [ ] **Step 4: Verify dev server starts**

Run: `cd frontend && npm run dev` (check in browser — no errors in console)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CompetitionSwitcher.tsx frontend/src/App.tsx frontend/src/App.css
git commit -m "feat: competition switcher UI and App.tsx integration"
```

---

### Task 7: Scope PickTeam by competition

**Files:**
- Modify: `frontend/src/components/PickTeam.tsx`

- [ ] **Step 1: Add competition context to PickTeam**

At the top of the `PickTeam` function (line 8), add:

```tsx
import { useCompetition } from '../contexts/CompetitionContext';
```

Inside the component, add after the state declarations (after line 21):

```tsx
  const { selectedCompetition } = useCompetition();
```

- [ ] **Step 2: Scope data fetching by competition_id**

In `loadData()`:

Replace picks fetch (lines 34-37):
```tsx
      const picksData = await pb.collection('picks').getFullList({
        filter: `user_id = "${pb.authStore.model!.id}" && competition_id = "${selectedCompetition?.id || ''}"`,
        expand: 'team_id',
      }) as unknown as Pick[];
```

Replace deadlines fetch (lines 40-42):
```tsx
      const deadlines = await pb.collection('deadlines').getFullList({
        filter: selectedCompetition ? `competition_id = "${selectedCompetition.id}"` : '',
        sort: '-week_number',
      }) as unknown as Deadline[];
```

In `checkEliminationStatus`, scope winning_teams fetch (line 137):
```tsx
      const allWinners = await pb.collection('winning_teams').getFullList({
        filter: selectedCompetition ? `competition_id = "${selectedCompetition.id}"` : '',
      }) as unknown as WinningTeam[];
```

- [ ] **Step 3: Include competition_id in pick creation/update**

In `autoAssignTeam` (line 108), add `competition_id`:
```tsx
      const autoPick = await pb.collection('picks').create({
        user_id: pb.authStore.model!.id,
        team_id: availableTeam.id,
        week_number: weekNumber,
        competition_id: selectedCompetition?.id || '',
      });
```

In `handleSubmit` (lines 160-173):
```tsx
      const existingPicks = await pb.collection('picks').getFullList({
        filter: `user_id = "${pb.authStore.model!.id}" && week_number = ${currentWeek} && competition_id = "${selectedCompetition?.id || ''}"`,
      });

      if (existingPicks.length > 0) {
        await pb.collection('picks').update(existingPicks[0]!.id, {
          team_id: selectedTeam,
        });
      } else {
        await pb.collection('picks').create({
          user_id: pb.authStore.model!.id,
          team_id: selectedTeam,
          week_number: currentWeek,
          competition_id: selectedCompetition?.id || '',
        });
      }
```

- [ ] **Step 4: Re-load when competition changes**

Add `selectedCompetition` to the useEffect dependency:

```tsx
  useEffect(() => {
    if (selectedCompetition) {
      setLoading(true);
      loadData();
    }
  }, [selectedCompetition?.id]);
```

Remove the original empty-dependency useEffect (lines 23-25).

- [ ] **Step 5: Show competition name in header**

Change line 290:
```tsx
      <h2>Pick Your Team - Week {currentWeek} {selectedCompetition && `(${selectedCompetition.name})`}</h2>
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PickTeam.tsx
git commit -m "feat: scope PickTeam by selected competition"
```

---

### Task 8: Scope MyPicks by competition

**Files:**
- Modify: `frontend/src/components/MyPicks.tsx`

- [ ] **Step 1: Add competition context and scope queries**

Add import:
```tsx
import { useCompetition } from '../contexts/CompetitionContext';
```

Inside MyPicks function:
```tsx
  const { selectedCompetition } = useCompetition();
```

Replace `loadPicks` (lines 14-43):
```tsx
  const loadPicks = async () => {
    try {
      const compFilter = selectedCompetition ? ` && competition_id = "${selectedCompetition.id}"` : '';
      const [picksData, winners] = await Promise.all([
        pb.collection('picks').getFullList({
          filter: `user_id = "${pb.authStore.model!.id}"${compFilter}`,
          expand: 'team_id',
          sort: '-week_number',
        }) as unknown as Promise<Pick[]>,
        pb.collection('winning_teams').getFullList({
          filter: selectedCompetition ? `competition_id = "${selectedCompetition.id}"` : '',
        }) as unknown as Promise<WinningTeam[]>,
      ]);

      setWinningTeams(winners);

      const uniquePicks: Record<number, Pick> = {};
      picksData.forEach(pick => {
        const week = pick.week_number;
        if (!uniquePicks[week]) {
          uniquePicks[week] = pick;
        }
      });

      const finalPicks = Object.values(uniquePicks).sort((a, b) => a.week_number - b.week_number);
      setPicks(finalPicks);
    } catch (err) {
      console.error('Failed to load picks:', err);
    } finally {
      setLoading(false);
    }
  };
```

Replace useEffect:
```tsx
  useEffect(() => {
    if (selectedCompetition) {
      setLoading(true);
      loadPicks();
    }
  }, [selectedCompetition?.id]);
```

Update header:
```tsx
      <h2>My Picks History {selectedCompetition && `- ${selectedCompetition.name}`}</h2>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/MyPicks.tsx
git commit -m "feat: scope MyPicks by selected competition"
```

---

### Task 9: Scope AllPlayersPicksHistory by competition

**Files:**
- Modify: `frontend/src/components/AllPlayersPicksHistory.tsx`

- [ ] **Step 1: Add competition context and scope all queries**

Add import:
```tsx
import { useCompetition } from '../contexts/CompetitionContext';
```

Inside component, add:
```tsx
  const { selectedCompetition } = useCompetition();
```

In `loadHistoricalData` (line 96), scope the picks fetch:
```tsx
      const compFilter = selectedCompetition ? `competition_id = "${selectedCompetition.id}"` : '';
      const picks = await pb.collection('picks').getFullList({
        filter: compFilter,
        expand: 'user_id,team_id',
        sort: 'week_number',
      }) as unknown as Pick[];
```

Scope the deadlines fetch (line 121):
```tsx
      const deadlines = await pb.collection('deadlines').getFullList({
        filter: selectedCompetition ? `competition_id = "${selectedCompetition.id}"` : '',
        sort: 'week_number',
      }) as unknown as Deadline[];
```

Scope the winners fetch (line 125):
```tsx
      const allWinners = await pb.collection('winning_teams').getFullList({
        filter: selectedCompetition ? `competition_id = "${selectedCompetition.id}"` : '',
      }) as unknown as WinningTeam[];
```

In `calculateUserEliminations` (line 63), scope the winners fetch:
```tsx
      const allWinners = await pb.collection('winning_teams').getFullList({
        filter: selectedCompetition ? `competition_id = "${selectedCompetition.id}"` : '',
      }) as unknown as WinningTeam[];
```

Replace useEffect:
```tsx
  useEffect(() => {
    if (selectedCompetition) {
      setLoading(true);
      loadHistoricalData();
    }
  }, [selectedCompetition?.id]);
```

Update header:
```tsx
      <h2>All Players - {selectedCompetition?.name || 'Historical Picks'}</h2>
```

Show winners banner for ended competitions:
```tsx
      {selectedCompetition?.status === 'ended' && (
        <div className="message message--success" style={{ marginBottom: '15px' }}>
          This competition has ended (Weeks {selectedCompetition.start_week}–{selectedCompetition.end_week}).
        </div>
      )}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/AllPlayersPicksHistory.tsx
git commit -m "feat: scope AllPlayersPicksHistory by selected competition"
```

---

### Task 10: Admin competition management

**Files:**
- Create: `frontend/src/components/admin/CompetitionManagement.tsx`
- Modify: `frontend/src/components/Admin.tsx`

- [ ] **Step 1: Create CompetitionManagement component**

```tsx
// frontend/src/components/admin/CompetitionManagement.tsx
import { useState, useEffect } from 'react';
import { pb } from '../../lib/pocketbase';
import { useCompetition } from '../../contexts/CompetitionContext';
import type { Competition, User } from '../../types';

interface Props {
  users: User[];
}

function CompetitionManagement({ users }: Props) {
  const { competitions, reload } = useCompetition();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  // Default: all users selected
  useEffect(() => {
    setSelectedUsers(new Set(users.map(u => u.id)));
  }, [users]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      setMessage('Name is required');
      return;
    }
    if (selectedUsers.size === 0) {
      setMessage('Select at least one participant');
      return;
    }

    setCreating(true);
    setMessage('');
    try {
      const pbUrl = import.meta.env.VITE_POCKETBASE_URL || 'http://localhost:8090';
      const resp = await fetch(`${pbUrl}/api/competitions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': pb.authStore.token,
        },
        body: JSON.stringify({
          name: newName.trim(),
          participant_ids: Array.from(selectedUsers),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.message || 'Failed to create competition');
      }

      const data = await resp.json();
      setMessage(`Created "${data.name}" starting at week ${data.start_week} with ${data.participants} participants`);
      setShowCreateModal(false);
      setNewName('');
      await reload();
    } catch (err: unknown) {
      setMessage((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleEnd = async (comp: Competition) => {
    if (!window.confirm(`End "${comp.name}"? This will freeze all picks and mark it as completed.`)) return;

    setEnding(comp.id);
    setMessage('');
    try {
      const pbUrl = import.meta.env.VITE_POCKETBASE_URL || 'http://localhost:8090';
      const resp = await fetch(`${pbUrl}/api/competitions/${comp.id}/end`, {
        method: 'POST',
        headers: { 'Authorization': pb.authStore.token },
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.message || 'Failed to end competition');
      }

      setMessage(`"${comp.name}" has been ended`);
      await reload();
    } catch (err: unknown) {
      setMessage((err as Error).message);
    } finally {
      setEnding(null);
    }
  };

  const toggleUser = (uid: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const activeComps = competitions.filter(c => c.status === 'active');
  const endedComps = competitions.filter(c => c.status === 'ended');

  return (
    <div>
      {message && (
        <div className={message.includes('Failed') ? 'error' : 'success'} style={{ marginBottom: '15px' }}>
          {message}
        </div>
      )}

      <button
        onClick={() => setShowCreateModal(true)}
        style={{
          padding: '12px 24px',
          backgroundColor: 'var(--color-primary)',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 'bold',
          cursor: 'pointer',
          marginBottom: '20px',
        }}
      >
        + Start New Competition
      </button>

      {showCreateModal && (
        <div style={{
          border: '2px solid var(--color-primary)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px',
          backgroundColor: 'var(--color-surface)',
        }}>
          <h4 style={{ marginTop: 0 }}>New Competition</h4>

          <div className="form-group">
            <label>Competition Name</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Round 2"
            />
          </div>

          <div className="form-group">
            <label>Participants ({selectedUsers.size} / {users.length} selected)</label>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
              <button
                type="button"
                onClick={() => setSelectedUsers(new Set(users.map(u => u.id)))}
                style={{ padding: '4px 12px', fontSize: '12px' }}
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => setSelectedUsers(new Set())}
                style={{ padding: '4px 12px', fontSize: '12px' }}
              >
                Deselect All
              </button>
            </div>
            <div style={{
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid #ccc',
              borderRadius: '8px',
              padding: '10px',
            }}>
              {users.map(u => (
                <label key={u.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px 0',
                  cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={selectedUsers.has(u.id)}
                    onChange={() => toggleUser(u.id)}
                  />
                  {u.first_name} {u.last_name}
                  {u.isAdmin && <span className="admin-badge" style={{ fontSize: '10px' }}>ADMIN</span>}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{
                padding: '10px 20px',
                backgroundColor: 'var(--color-success)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: creating ? 'not-allowed' : 'pointer',
              }}
            >
              {creating ? 'Creating...' : 'Create Competition'}
            </button>
            <button
              onClick={() => setShowCreateModal(false)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {activeComps.length > 0 && (
        <>
          <h3>Active Competitions</h3>
          <table className="history-table" style={{ marginBottom: '20px' }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Start Week</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {activeComps.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 'bold' }}>{c.name}</td>
                  <td>Week {c.start_week}</td>
                  <td><span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>Active</span></td>
                  <td>
                    <button
                      onClick={() => handleEnd(c)}
                      disabled={ending === c.id}
                      style={{
                        padding: '6px 16px',
                        backgroundColor: 'var(--color-danger)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: ending === c.id ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      {ending === c.id ? 'Ending...' : 'End Competition'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {endedComps.length > 0 && (
        <>
          <h3>Past Competitions</h3>
          <table className="history-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Weeks</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {endedComps.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 'bold' }}>{c.name}</td>
                  <td>Week {c.start_week}–{c.end_week}</td>
                  <td><span style={{ color: 'var(--color-text-muted)' }}>Ended</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default CompetitionManagement;
```

- [ ] **Step 2: Add Competitions tab to Admin.tsx**

Add import:
```tsx
import CompetitionManagement from './admin/CompetitionManagement';
```

Add new tab button after "Reset Game" tab (after line 147):
```tsx
        <button
          onClick={() => setActiveTab('competitions')}
          className={`admin-tab ${activeTab === 'competitions' ? 'admin-tab--active' : ''}`}
        >
          Competitions
        </button>
```

Add tab content after the Reset section (after line 170):
```tsx
      {activeTab === 'competitions' && (
        <CompetitionManagement users={users} />
      )}
```

- [ ] **Step 3: Scope CurrentWeekPicks in Admin.tsx by competition**

Add import and usage in CurrentWeekPicks sub-component (line 7):
```tsx
import { useCompetition } from '../contexts/CompetitionContext';
```

Inside CurrentWeekPicks function:
```tsx
  const { selectedCompetition } = useCompetition();
```

Scope the deadlines query:
```tsx
      const deadlines = await pb.collection('deadlines').getFullList({
        filter: selectedCompetition ? `competition_id = "${selectedCompetition.id}"` : '',
        sort: '-week_number',
      }) as unknown as Deadline[];
```

Scope the picks query:
```tsx
      const picksData = await pb.collection('picks').getFullList({
        filter: `week_number = ${current.week_number}${selectedCompetition ? ` && competition_id = "${selectedCompetition.id}"` : ''}`,
        expand: 'user_id,team_id',
      }) as unknown as Pick[];
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/CompetitionManagement.tsx frontend/src/components/Admin.tsx
git commit -m "feat: admin competition management UI with create and end"
```

---

### Task 11: Run all tests and verify

**Files:** None (testing only)

- [ ] **Step 1: Run backend tests**

Run: `cd backend && go test ./...`
Expected: All 53+ tests pass

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && npm test`
Expected: All 16+ tests pass

- [ ] **Step 3: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds

---

### Task 12: End-to-end QA with mock simulation

**Files:** None (manual testing)

- [ ] **Step 1: Start backend in mock mode**

Run: `cd backend && MOCK_API=25 go run . serve`
Expected: Server starts, migration applies, "Round 1" competition created

- [ ] **Step 2: Start frontend**

Run: `cd frontend && npm run dev`
Expected: Dev server starts, competition switcher shows "Round 1"

- [ ] **Step 3: Create test users and make picks**

1. Create 3+ users via admin panel
2. Each user logs in and sees competition switcher (or hidden if only 1 comp)
3. Each user picks a team for Week 25
4. Verify picks are scoped to "Round 1" competition

- [ ] **Step 4: Advance several weeks**

Run: `curl -X POST http://localhost:8090/api/dev/advance` (repeat 3-5 times)
Expected:
- Winners marked per competition
- Users eliminated as expected
- Next week deadline created per competition
- Auto-picks assigned per competition

- [ ] **Step 5: Start a second competition**

Via Admin → Competitions tab:
1. Click "Start New Competition"
2. Name it "Round 2", deselect 1 user
3. Verify it appears in competition switcher
4. Verify picks/deadlines are separate per competition

- [ ] **Step 6: Verify parallel competition behavior**

1. As a user in both competitions: make picks in both (switching via dropdown)
2. Advance weeks
3. Verify: elimination in one competition doesn't affect the other
4. Verify: used teams tracked separately per competition
5. Pick the same team in both competitions — should work

- [ ] **Step 7: End a competition**

Via Admin → Competitions → "End Competition" on Round 1:
1. Verify it shows as "Ended" in admin
2. Verify it moves to "Ended" section in switcher
3. Verify historical data is frozen
4. Verify AllPlayersPicksHistory shows ended banner

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix: QA fixes from parallel competitions testing"
```
