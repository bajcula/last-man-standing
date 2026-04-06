package hooks

import (
	"os"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/bajcula/last-man-standing/backend/services"

	// Register our migrations so they run on the test app.
	_ "github.com/bajcula/last-man-standing/backend/migrations"
)

// setupTestApp creates a fresh PocketBase test app with all migrations applied.
func setupTestApp(t *testing.T) core.App {
	t.Helper()

	tempDir, err := os.MkdirTemp("", "hooks_test_*")
	if err != nil {
		t.Fatal(err)
	}

	app, err := tests.NewTestApp(tempDir)
	if err != nil {
		os.RemoveAll(tempDir)
		t.Fatal(err)
	}
	t.Cleanup(func() { app.Cleanup() })

	return app
}

// createUser creates a test user and returns its record ID.
func createUser(t *testing.T, app core.App, firstName, lastName string, isAdmin bool) string {
	t.Helper()
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	u := core.NewRecord(users)
	u.Set("email", firstName+"@test.com")
	u.SetPassword("testtest123")
	u.Set("first_name", firstName)
	u.Set("last_name", lastName)
	u.Set("isAdmin", isAdmin)
	if err := app.Save(u); err != nil {
		t.Fatal(err)
	}
	return u.Id
}

// createCompetition creates a test competition and returns its record ID.
func createCompetition(t *testing.T, app core.App, name string, startWeek int, status string) string {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("competitions")
	if err != nil {
		t.Fatal(err)
	}
	c := core.NewRecord(col)
	c.Set("name", name)
	c.Set("status", status)
	c.Set("start_week", startWeek)
	if err := app.Save(c); err != nil {
		t.Fatal(err)
	}
	return c.Id
}

// addParticipant adds a user as a competition participant.
func addParticipant(t *testing.T, app core.App, competitionID, userID string) {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("competition_participants")
	if err != nil {
		t.Fatal(err)
	}
	p := core.NewRecord(col)
	p.Set("competition_id", competitionID)
	p.Set("user_id", userID)
	p.Set("is_eliminated", false)
	if err := app.Save(p); err != nil {
		t.Fatal(err)
	}
}

// createPick creates a pick record.
func createPick(t *testing.T, app core.App, userID, teamID, competitionID string, week int) {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("picks")
	if err != nil {
		t.Fatal(err)
	}
	p := core.NewRecord(col)
	p.Set("user_id", userID)
	p.Set("team_id", teamID)
	p.Set("week_number", week)
	p.Set("competition_id", competitionID)
	if err := app.Save(p); err != nil {
		t.Fatal(err)
	}
}

// createWinner creates a winning_teams record.
func createWinner(t *testing.T, app core.App, teamID, competitionID string, week int) {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("winning_teams")
	if err != nil {
		t.Fatal(err)
	}
	w := core.NewRecord(col)
	w.Set("week_number", week)
	w.Set("team_id", teamID)
	w.Set("competition_id", competitionID)
	if err := app.Save(w); err != nil {
		t.Fatal(err)
	}
}

// getTeamID finds a team by name and returns its ID.
func getTeamID(t *testing.T, app core.App, name string) string {
	t.Helper()
	teams, err := app.FindRecordsByFilter("teams", "team_name = {:name}", "", 1, 0, map[string]any{"name": name})
	if err != nil || len(teams) == 0 {
		t.Fatalf("team %q not found", name)
	}
	return teams[0].Id
}

// countRecords counts records matching a filter in a collection.
func countRecords(t *testing.T, app core.App, collection, filter string, params ...map[string]any) int {
	t.Helper()
	var p map[string]any
	if len(params) > 0 {
		p = params[0]
	}
	records, err := app.FindRecordsByFilter(collection, filter, "", 0, 0, p)
	if err != nil {
		return 0
	}
	return len(records)
}

// deleteMigrationCompetition removes the "Round 1" competition created by migration 004
// so tests start with a clean slate.
func deleteMigrationCompetition(t *testing.T, app core.App) {
	t.Helper()
	records, _ := app.FindRecordsByFilter("competitions", "id != ''", "", 0, 0)
	for _, r := range records {
		app.Delete(r)
	}
	records, _ = app.FindRecordsByFilter("competition_participants", "id != ''", "", 0, 0)
	for _, r := range records {
		app.Delete(r)
	}
}

// --- Tests ---

func TestAutoAssignPicks_ScopedToCompetitionParticipants(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	alice := createUser(t, app, "Alice", "Aa", false)
	bob := createUser(t, app, "Bob", "Bb", false)
	charlie := createUser(t, app, "Charlie", "Cc", false)

	compA := createCompetition(t, app, "Comp A", 1, "active")
	compB := createCompetition(t, app, "Comp B", 1, "active")

	// Alice and Bob in Comp A; Charlie in Comp B
	addParticipant(t, app, compA, alice)
	addParticipant(t, app, compA, bob)
	addParticipant(t, app, compB, charlie)

	autoAssignPicks(app, 1, compA)

	picksA := countRecords(t, app, "picks", "competition_id = {:cid} && week_number = 1", map[string]any{"cid": compA})
	picksB := countRecords(t, app, "picks", "competition_id = {:cid} && week_number = 1", map[string]any{"cid": compB})

	if picksA != 2 {
		t.Errorf("expected 2 picks for Comp A, got %d", picksA)
	}
	if picksB != 0 {
		t.Errorf("expected 0 picks for Comp B, got %d", picksB)
	}
}

func TestAutoAssignPicks_SkipsEliminatedPlayers(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	alice := createUser(t, app, "Alice", "Aa", false)
	bob := createUser(t, app, "Bob", "Bb", false)

	comp := createCompetition(t, app, "Comp", 1, "active")
	addParticipant(t, app, comp, alice)
	addParticipant(t, app, comp, bob)

	arsenalID := getTeamID(t, app, "Arsenal")
	chelseaID := getTeamID(t, app, "Chelsea")

	// Week 1: Alice picks Arsenal (winner), Bob picks Chelsea (loser)
	createPick(t, app, alice, arsenalID, comp, 1)
	createPick(t, app, bob, chelseaID, comp, 1)
	createWinner(t, app, arsenalID, comp, 1)

	// Auto-assign week 2: Bob should be skipped (eliminated)
	autoAssignPicks(app, 2, comp)

	alicePicks := countRecords(t, app, "picks", "user_id = {:uid} && week_number = 2 && competition_id = {:cid}",
		map[string]any{"uid": alice, "cid": comp})
	bobPicks := countRecords(t, app, "picks", "user_id = {:uid} && week_number = 2 && competition_id = {:cid}",
		map[string]any{"uid": bob, "cid": comp})

	if alicePicks != 1 {
		t.Errorf("expected 1 pick for Alice in week 2, got %d", alicePicks)
	}
	if bobPicks != 0 {
		t.Errorf("expected 0 picks for eliminated Bob in week 2, got %d", bobPicks)
	}
}

func TestAutoAssignPicks_UsedTeamsPerCompetition(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	alice := createUser(t, app, "Alice", "Aa", false)
	compA := createCompetition(t, app, "Comp A", 1, "active")
	compB := createCompetition(t, app, "Comp B", 1, "active")
	addParticipant(t, app, compA, alice)
	addParticipant(t, app, compB, alice)

	arsenalID := getTeamID(t, app, "Arsenal")

	// Alice used Arsenal in Comp A week 1
	createPick(t, app, alice, arsenalID, compA, 1)
	createWinner(t, app, arsenalID, compA, 1)

	// Auto-assign in Comp B week 1: Alice should get Arsenal (first alphabetically)
	// because used teams are per-competition
	autoAssignPicks(app, 1, compB)

	picks, _ := app.FindRecordsByFilter("picks",
		"user_id = {:uid} && competition_id = {:cid} && week_number = 1",
		"", 1, 0,
		map[string]any{"uid": alice, "cid": compB})

	if len(picks) != 1 {
		t.Fatalf("expected 1 pick in Comp B, got %d", len(picks))
	}
	if picks[0].GetString("team_id") != arsenalID {
		t.Errorf("expected Arsenal (first alpha) in Comp B, got team %s", picks[0].GetString("team_id"))
	}
}

func TestWeekAlreadyProcessed_ScopedByCompetition(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	compA := createCompetition(t, app, "Comp A", 1, "active")
	compB := createCompetition(t, app, "Comp B", 1, "active")

	arsenalID := getTeamID(t, app, "Arsenal")
	createWinner(t, app, arsenalID, compA, 1)

	if !weekAlreadyProcessed(app, 1, compA) {
		t.Error("expected week 1 processed in Comp A")
	}
	if weekAlreadyProcessed(app, 1, compB) {
		t.Error("expected week 1 NOT processed in Comp B")
	}
}

func TestGetCurrentWeek_ScopedByCompetition(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	compA := createCompetition(t, app, "Comp A", 1, "active")
	compB := createCompetition(t, app, "Comp B", 10, "active")

	// Create deadline for Comp A at week 5
	dlCol, _ := app.FindCollectionByNameOrId("deadlines")
	dl := core.NewRecord(dlCol)
	dl.Set("week_number", 5)
	dl.Set("deadline_time", "2026-04-01T12:00:00Z")
	dl.Set("is_closed", false)
	dl.Set("competition_id", compA)
	app.Save(dl)

	weekA := getCurrentWeek(app, compA, 1)
	weekB := getCurrentWeek(app, compB, 10)

	if weekA != 5 {
		t.Errorf("expected current week 5 for Comp A, got %d", weekA)
	}
	if weekB != 10 {
		t.Errorf("expected current week 10 (start_week) for Comp B, got %d", weekB)
	}
}

func TestMarkWinners_ScopedByCompetition(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	compA := createCompetition(t, app, "Comp A", 1, "active")
	compB := createCompetition(t, app, "Comp B", 1, "active")

	matches := []services.APIMatch{
		{
			HomeTeam:  "Arsenal",
			AwayTeam:  "Chelsea",
			HomeScore: "2",
			AwayScore: "0",
			Status:    "Match Finished",
		},
	}

	markWinners(app, 1, matches, compA)

	winnersA := countRecords(t, app, "winning_teams", "competition_id = {:cid} && week_number = 1", map[string]any{"cid": compA})
	winnersB := countRecords(t, app, "winning_teams", "competition_id = {:cid} && week_number = 1", map[string]any{"cid": compB})

	if winnersA != 1 {
		t.Errorf("expected 1 winner in Comp A, got %d", winnersA)
	}
	if winnersB != 0 {
		t.Errorf("expected 0 winners in Comp B, got %d", winnersB)
	}
}

func TestMarkWinners_NoDuplicates(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	comp := createCompetition(t, app, "Comp", 1, "active")

	matches := []services.APIMatch{
		{
			HomeTeam:  "Arsenal",
			AwayTeam:  "Chelsea",
			HomeScore: "2",
			AwayScore: "0",
			Status:    "Match Finished",
		},
	}

	markWinners(app, 1, matches, comp)
	markWinners(app, 1, matches, comp) // run again

	winners := countRecords(t, app, "winning_teams", "competition_id = {:cid} && week_number = 1", map[string]any{"cid": comp})
	if winners != 1 {
		t.Errorf("expected 1 winner (no duplicates), got %d", winners)
	}
}

func TestIsEliminated_ScopedByCompetition(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	alice := createUser(t, app, "Alice", "Aa", false)

	compA := createCompetition(t, app, "Comp A", 1, "active")
	compB := createCompetition(t, app, "Comp B", 1, "active")

	arsenalID := getTeamID(t, app, "Arsenal")
	chelseaID := getTeamID(t, app, "Chelsea")

	// Alice picks Chelsea (loser) in Comp A, Arsenal (winner) in Comp B
	createPick(t, app, alice, chelseaID, compA, 1)
	createPick(t, app, alice, arsenalID, compB, 1)
	createWinner(t, app, arsenalID, compA, 1)
	createWinner(t, app, arsenalID, compB, 1)

	if !isEliminated(app, alice, 2, compA) {
		t.Error("expected Alice eliminated in Comp A (picked Chelsea, Arsenal won)")
	}
	if isEliminated(app, alice, 2, compB) {
		t.Error("expected Alice NOT eliminated in Comp B (picked Arsenal, Arsenal won)")
	}
}

func TestRunGameweekAutomation_OnlyActiveCompetitions(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	alice := createUser(t, app, "Alice", "Aa", false)

	active := createCompetition(t, app, "Active Comp", 1, "active")
	ended := createCompetition(t, app, "Ended Comp", 1, "ended")

	addParticipant(t, app, active, alice)
	addParticipant(t, app, ended, alice)

	fetcher := services.NewMockFetcher(1)
	RunGameweekAutomation(app, fetcher)

	// Active competition should get a deadline and picks
	activeDeadlines := countRecords(t, app, "deadlines", "competition_id = {:cid}", map[string]any{"cid": active})
	endedDeadlines := countRecords(t, app, "deadlines", "competition_id = {:cid}", map[string]any{"cid": ended})

	if activeDeadlines == 0 {
		t.Error("expected deadlines created for active competition")
	}
	if endedDeadlines != 0 {
		t.Errorf("expected 0 deadlines for ended competition, got %d", endedDeadlines)
	}
}

func TestCreateDeadline_ScopedByCompetition(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	compA := createCompetition(t, app, "Comp A", 1, "active")
	compB := createCompetition(t, app, "Comp B", 1, "active")

	fetcher := services.NewMockFetcher(1)

	createDeadline(app, 1, "2025-2026", fetcher, compA)

	dlA := countRecords(t, app, "deadlines", "competition_id = {:cid} && week_number = 1", map[string]any{"cid": compA})
	dlB := countRecords(t, app, "deadlines", "competition_id = {:cid} && week_number = 1", map[string]any{"cid": compB})

	if dlA != 1 {
		t.Errorf("expected 1 deadline for Comp A, got %d", dlA)
	}
	if dlB != 0 {
		t.Errorf("expected 0 deadlines for Comp B, got %d", dlB)
	}

	// Creating again should not duplicate
	createDeadline(app, 1, "2025-2026", fetcher, compA)
	dlA = countRecords(t, app, "deadlines", "competition_id = {:cid} && week_number = 1", map[string]any{"cid": compA})
	if dlA != 1 {
		t.Errorf("expected 1 deadline (no duplicate) for Comp A, got %d", dlA)
	}
}
