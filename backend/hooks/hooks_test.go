package hooks

import (
	"bytes"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

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

// =============================================================================
// Edge cases
// =============================================================================

func TestAutoAssignPicks_AllEliminatedProducesZeroPicks(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	alice := createUser(t, app, "Alice", "Aa", false)
	bob := createUser(t, app, "Bob", "Bb", false)

	comp := createCompetition(t, app, "Comp", 1, "active")
	addParticipant(t, app, comp, alice)
	addParticipant(t, app, comp, bob)

	arsenalID := getTeamID(t, app, "Arsenal")
	chelseaID := getTeamID(t, app, "Chelsea")

	// Both pick losers in week 1
	createPick(t, app, alice, chelseaID, comp, 1)
	createPick(t, app, bob, chelseaID, comp, 1)
	createWinner(t, app, arsenalID, comp, 1) // only Arsenal won

	autoAssignPicks(app, 2, comp)

	picks := countRecords(t, app, "picks", "competition_id = {:cid} && week_number = 2", map[string]any{"cid": comp})
	if picks != 0 {
		t.Errorf("expected 0 picks when all participants eliminated, got %d", picks)
	}
}

func TestAutoAssignPicks_NoParticipantsIsNoOp(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	comp := createCompetition(t, app, "Empty Comp", 1, "active")
	// No participants added

	autoAssignPicks(app, 1, comp)

	picks := countRecords(t, app, "picks", "competition_id = {:cid}", map[string]any{"cid": comp})
	if picks != 0 {
		t.Errorf("expected 0 picks for comp with no participants, got %d", picks)
	}
}

func TestAutoAssignPicks_DoesNotReassignExistingPick(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	alice := createUser(t, app, "Alice", "Aa", false)
	comp := createCompetition(t, app, "Comp", 1, "active")
	addParticipant(t, app, comp, alice)

	chelseaID := getTeamID(t, app, "Chelsea")
	createPick(t, app, alice, chelseaID, comp, 1) // Alice already picked Chelsea

	autoAssignPicks(app, 1, comp) // should not overwrite

	picks, _ := app.FindRecordsByFilter("picks",
		"user_id = {:uid} && competition_id = {:cid} && week_number = 1",
		"", 0, 0,
		map[string]any{"uid": alice, "cid": comp})

	if len(picks) != 1 {
		t.Fatalf("expected exactly 1 pick, got %d", len(picks))
	}
	if picks[0].GetString("team_id") != chelseaID {
		t.Errorf("pick should still be Chelsea, got %s", picks[0].GetString("team_id"))
	}
}

func TestMarkWinners_AllDrawsProducesZeroWinners(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	comp := createCompetition(t, app, "Comp", 1, "active")

	matches := []services.APIMatch{
		{HomeTeam: "Arsenal", AwayTeam: "Chelsea", HomeScore: "1", AwayScore: "1", Status: "Match Finished"},
		{HomeTeam: "Liverpool", AwayTeam: "Everton", HomeScore: "0", AwayScore: "0", Status: "Match Finished"},
	}

	markWinners(app, 1, matches, comp)

	winners := countRecords(t, app, "winning_teams", "competition_id = {:cid} && week_number = 1", map[string]any{"cid": comp})
	if winners != 0 {
		t.Errorf("expected 0 winners when all draws, got %d", winners)
	}
}

func TestRunGameweekAutomation_TwoActiveCompetitionsProcessedIndependently(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	alice := createUser(t, app, "Alice", "Aa", false)
	bob := createUser(t, app, "Bob", "Bb", false)

	compA := createCompetition(t, app, "Comp A", 1, "active")
	compB := createCompetition(t, app, "Comp B", 1, "active")

	addParticipant(t, app, compA, alice)
	addParticipant(t, app, compB, bob)

	fetcher := services.NewMockFetcher(1)
	RunGameweekAutomation(app, fetcher)

	// Both should get deadlines
	dlA := countRecords(t, app, "deadlines", "competition_id = {:cid}", map[string]any{"cid": compA})
	dlB := countRecords(t, app, "deadlines", "competition_id = {:cid}", map[string]any{"cid": compB})
	if dlA == 0 {
		t.Error("expected deadlines for Comp A")
	}
	if dlB == 0 {
		t.Error("expected deadlines for Comp B")
	}

	// Alice should have picks only in Comp A, Bob only in Comp B
	aliceA := countRecords(t, app, "picks", "user_id = {:uid} && competition_id = {:cid}", map[string]any{"uid": alice, "cid": compA})
	aliceB := countRecords(t, app, "picks", "user_id = {:uid} && competition_id = {:cid}", map[string]any{"uid": alice, "cid": compB})
	bobA := countRecords(t, app, "picks", "user_id = {:uid} && competition_id = {:cid}", map[string]any{"uid": bob, "cid": compA})
	bobB := countRecords(t, app, "picks", "user_id = {:uid} && competition_id = {:cid}", map[string]any{"uid": bob, "cid": compB})

	if aliceA != 1 {
		t.Errorf("expected 1 pick for Alice in Comp A, got %d", aliceA)
	}
	if aliceB != 0 {
		t.Errorf("expected 0 picks for Alice in Comp B, got %d", aliceB)
	}
	if bobA != 0 {
		t.Errorf("expected 0 picks for Bob in Comp A, got %d", bobA)
	}
	if bobB != 1 {
		t.Errorf("expected 1 pick for Bob in Comp B, got %d", bobB)
	}
}

func TestIsEliminated_SkipsWeeksWithNoWinners(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	alice := createUser(t, app, "Alice", "Aa", false)
	comp := createCompetition(t, app, "Comp", 1, "active")

	arsenalID := getTeamID(t, app, "Arsenal")
	chelseaID := getTeamID(t, app, "Chelsea")

	// Week 1: Alice picks Arsenal (winner)
	createPick(t, app, alice, arsenalID, comp, 1)
	createWinner(t, app, arsenalID, comp, 1)
	// Week 2: no winners declared (no matches played)
	// Week 3: Alice picks Chelsea (winner)
	createPick(t, app, alice, chelseaID, comp, 3)
	createWinner(t, app, chelseaID, comp, 3)

	// Alice should NOT be eliminated — week 2 had no winners, so it's skipped
	if isEliminated(app, alice, 4, comp) {
		t.Error("expected Alice NOT eliminated — week 2 had no winners and should be skipped")
	}
}

func TestIsEliminated_NoPick_ForWeekWithWinners(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	alice := createUser(t, app, "Alice", "Aa", false)
	comp := createCompetition(t, app, "Comp", 1, "active")

	arsenalID := getTeamID(t, app, "Arsenal")

	// Week 1: winners declared but Alice has NO pick
	createWinner(t, app, arsenalID, comp, 1)

	if !isEliminated(app, alice, 2, comp) {
		t.Error("expected Alice eliminated — had no pick for week 1 which had winners")
	}
}

func TestEnsureNextWeekReady_CreatesDeadlineAndPicks(t *testing.T) {
	app := setupTestApp(t)
	deleteMigrationCompetition(t, app)

	alice := createUser(t, app, "Alice", "Aa", false)
	comp := createCompetition(t, app, "Comp", 5, "active")
	addParticipant(t, app, comp, alice)

	fetcher := services.NewMockFetcher(5)

	ensureNextWeekReady(app, 5, "2025-2026", fetcher, comp)

	// Should have created deadline for week 6
	dl := countRecords(t, app, "deadlines", "competition_id = {:cid} && week_number = 6", map[string]any{"cid": comp})
	if dl != 1 {
		t.Errorf("expected 1 deadline for week 6, got %d", dl)
	}

	// Should have auto-assigned pick for Alice in week 6
	picks := countRecords(t, app, "picks", "user_id = {:uid} && competition_id = {:cid} && week_number = 6",
		map[string]any{"uid": alice, "cid": comp})
	if picks != 1 {
		t.Errorf("expected 1 pick for Alice in week 6, got %d", picks)
	}
}

// =============================================================================
// API endpoint tests (competition routes + picks guard)
// =============================================================================

// newTestAppForAPI creates a test app suitable for ApiScenario (returns *tests.TestApp).
func newTestAppForAPI(t testing.TB) *tests.TestApp {
	t.Helper()
	tempDir, err := os.MkdirTemp("", "api_test_*")
	if err != nil {
		t.Fatal(err)
	}
	app, err := tests.NewTestApp(tempDir)
	if err != nil {
		os.RemoveAll(tempDir)
		t.Fatal(err)
	}
	return app
}

// createUserTB is like createUser but accepts testing.TB for use in ApiScenario factories.
func createUserTB(t testing.TB, app core.App, email, firstName, lastName string, isAdmin bool) string {
	t.Helper()
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	u := core.NewRecord(users)
	u.Set("email", email)
	u.SetPassword("testtest123")
	u.Set("first_name", firstName)
	u.Set("last_name", lastName)
	u.Set("isAdmin", isAdmin)
	if err := app.Save(u); err != nil {
		t.Fatal(err)
	}
	return u.Id
}

func generateToken(t testing.TB, app core.App, userID string) string {
	t.Helper()
	record, err := app.FindRecordById("users", userID)
	if err != nil {
		t.Fatal(err)
	}
	token, err := record.NewStaticAuthToken(time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func deleteMigrationDataTB(t testing.TB, app core.App) {
	t.Helper()
	for _, col := range []string{"competition_participants", "competitions"} {
		records, _ := app.FindRecordsByFilter(col, "id != ''", "", 0, 0)
		for _, r := range records {
			app.Delete(r)
		}
	}
}

func TestAPI_CreateCompetition_AdminOnly(t *testing.T) {
	headers := map[string]string{}

	scenario := tests.ApiScenario{
		Name:   "non-admin gets 403",
		Method: http.MethodPost,
		URL:    "/api/competitions",
		Body:   strings.NewReader(`{"name":"Test","participant_ids":["fake"]}`),
		Headers: headers,
		TestAppFactory: func(t testing.TB) *tests.TestApp {
			app := newTestAppForAPI(t)
			deleteMigrationDataTB(t, app)
			uid := createUserTB(t, app, "user@test.com", "Normal", "User", false)
			headers["Authorization"] = generateToken(t, app, uid)
			RegisterCompetitionRoutes(app)
			return app
		},
		ExpectedStatus:  403,
		ExpectedContent: []string{`"Admin only."`},
	}
	scenario.Test(t)
}

func TestAPI_CreateCompetition_AdminSuccess(t *testing.T) {
	// Use bytes.Buffer so we can write the body in TestAppFactory (after IDs are known).
	headers := map[string]string{}
	var body bytes.Buffer

	scenario := tests.ApiScenario{
		Name:    "admin creates competition",
		Method:  http.MethodPost,
		URL:     "/api/competitions",
		Body:    &body,
		Headers: headers,
		TestAppFactory: func(t testing.TB) *tests.TestApp {
			app := newTestAppForAPI(t)
			deleteMigrationDataTB(t, app)
			adminID := createUserTB(t, app, "admin@test.com", "Admin", "User", true)
			playerID := createUserTB(t, app, "player@test.com", "Player", "One", false)
			headers["Authorization"] = generateToken(t, app, adminID)
			body.WriteString(fmt.Sprintf(`{"name":"New Round","participant_ids":["%s"]}`, playerID))
			RegisterCompetitionRoutes(app)
			return app
		},
		ExpectedStatus:  200,
		ExpectedContent: []string{`"name":"New Round"`, `"participants":1`},
	}
	scenario.Test(t)
}

func TestAPI_CreateCompetition_RequiresName(t *testing.T) {
	headers := map[string]string{}

	scenario := tests.ApiScenario{
		Name:    "missing name returns 400",
		Method:  http.MethodPost,
		URL:     "/api/competitions",
		Body:    strings.NewReader(`{"name":"","participant_ids":["fake"]}`),
		Headers: headers,
		TestAppFactory: func(t testing.TB) *tests.TestApp {
			app := newTestAppForAPI(t)
			deleteMigrationDataTB(t, app)
			adminID := createUserTB(t, app, "admin@test.com", "Admin", "User", true)
			headers["Authorization"] = generateToken(t, app, adminID)
			RegisterCompetitionRoutes(app)
			return app
		},
		ExpectedStatus:  400,
		ExpectedContent: []string{`"Name is required."`},
	}
	scenario.Test(t)
}

func TestAPI_CreateCompetition_RequiresParticipants(t *testing.T) {
	headers := map[string]string{}

	scenario := tests.ApiScenario{
		Name:    "empty participants returns 400",
		Method:  http.MethodPost,
		URL:     "/api/competitions",
		Body:    strings.NewReader(`{"name":"Test","participant_ids":[]}`),
		Headers: headers,
		TestAppFactory: func(t testing.TB) *tests.TestApp {
			app := newTestAppForAPI(t)
			deleteMigrationDataTB(t, app)
			adminID := createUserTB(t, app, "admin@test.com", "Admin", "User", true)
			headers["Authorization"] = generateToken(t, app, adminID)
			RegisterCompetitionRoutes(app)
			return app
		},
		ExpectedStatus:  400,
		ExpectedContent: []string{`"At least one participant is required."`},
	}
	scenario.Test(t)
}

func TestAPI_EndCompetition_AdminOnly(t *testing.T) {
	// URL needs dynamic comp ID — use BeforeTestFunc to create data and capture the URL.
	headers := map[string]string{}
	var url string

	scenario := tests.ApiScenario{
		Name:    "non-admin gets 403 on end",
		Method:  http.MethodPost,
		URL:     "/api/competitions/nonexistent/end", // Will be overridden if we could, but any ID gives 403 for non-admin
		Headers: headers,
		TestAppFactory: func(t testing.TB) *tests.TestApp {
			app := newTestAppForAPI(t)
			deleteMigrationDataTB(t, app)
			uid := createUserTB(t, app, "user@test.com", "Normal", "User", false)
			headers["Authorization"] = generateToken(t, app, uid)
			RegisterCompetitionRoutes(app)
			return app
		},
		ExpectedStatus:  403,
		ExpectedContent: []string{`"Admin only."`},
	}
	scenario.Test(t)
	_ = url
}

func TestAPI_EndCompetition_AlreadyEnded(t *testing.T) {
	// Use a deterministic ID so the URL can be set at struct construction time.
	const fixedCompID = "endedcomp00001x"
	headers := map[string]string{}

	scenario := tests.ApiScenario{
		Name:    "ending already-ended competition returns 400",
		Method:  http.MethodPost,
		URL:     "/api/competitions/" + fixedCompID + "/end",
		Headers: headers,
		TestAppFactory: func(t testing.TB) *tests.TestApp {
			app := newTestAppForAPI(t)
			deleteMigrationDataTB(t, app)
			adminID := createUserTB(t, app, "admin@test.com", "Admin", "User", true)
			headers["Authorization"] = generateToken(t, app, adminID)

			col, _ := app.FindCollectionByNameOrId("competitions")
			c := core.NewRecord(col)
			c.Set("id", fixedCompID)
			c.Set("name", "Already Done")
			c.Set("status", "ended")
			c.Set("start_week", 1)
			c.Set("end_week", 5)
			if err := app.Save(c); err != nil {
				t.Fatalf("failed to save ended competition: %v", err)
			}

			RegisterCompetitionRoutes(app)
			return app
		},
		ExpectedStatus:  400,
		ExpectedContent: []string{`already ended`},
	}
	scenario.Test(t)
}

func TestAPI_UnauthenticatedUserCannotCreateCompetition(t *testing.T) {
	scenario := tests.ApiScenario{
		Name:   "no auth token returns 403",
		Method: http.MethodPost,
		URL:    "/api/competitions",
		Body:   strings.NewReader(`{"name":"Test","participant_ids":["fake"]}`),
		TestAppFactory: func(t testing.TB) *tests.TestApp {
			app := newTestAppForAPI(t)
			RegisterCompetitionRoutes(app)
			return app
		},
		ExpectedStatus:  403,
		ExpectedContent: []string{`"Admin only."`},
	}
	scenario.Test(t)
}

// =============================================================================
// Picks guard tests
// =============================================================================

func TestAPI_PicksGuard_UsedTeamBlockedInSameCompetition(t *testing.T) {
	headers := map[string]string{}
	var body bytes.Buffer

	scenario := tests.ApiScenario{
		Name:    "used team in same competition blocked",
		Method:  http.MethodPost,
		URL:     "/api/collections/picks/records",
		Body:    &body,
		Headers: headers,
		TestAppFactory: func(t testing.TB) *tests.TestApp {
			app := newTestAppForAPI(t)
			deleteMigrationDataTB(t, app)

			uid := createUserTB(t, app, "player@test.com", "Player", "One", false)
			headers["Authorization"] = generateToken(t, app, uid)

			col, _ := app.FindCollectionByNameOrId("competitions")
			c := core.NewRecord(col)
			c.Set("name", "Comp")
			c.Set("status", "active")
			c.Set("start_week", 1)
			app.Save(c)
			compID := c.Id

			dlCol, _ := app.FindCollectionByNameOrId("deadlines")
			for _, wk := range []int{1, 2} {
				dl := core.NewRecord(dlCol)
				dl.Set("week_number", wk)
				dl.Set("deadline_time", time.Now().Add(24*time.Hour).UTC().Format(time.RFC3339))
				dl.Set("is_closed", false)
				dl.Set("competition_id", compID)
				app.Save(dl)
			}

			teams, _ := app.FindRecordsByFilter("teams", "team_name = 'Arsenal'", "", 1, 0)
			arsenalID := teams[0].Id

			pickCol, _ := app.FindCollectionByNameOrId("picks")
			p := core.NewRecord(pickCol)
			p.Set("user_id", uid)
			p.Set("team_id", arsenalID)
			p.Set("week_number", 1)
			p.Set("competition_id", compID)
			app.Save(p)

			// Request body: try to pick Arsenal again in week 2 (same competition)
			body.WriteString(fmt.Sprintf(
				`{"user_id":"%s","team_id":"%s","week_number":2,"competition_id":"%s"}`,
				uid, arsenalID, compID,
			))

			RegisterPicksGuard(app)
			return app
		},
		ExpectedStatus:  403,
		ExpectedContent: []string{`already used this team in this competition`},
	}
	scenario.Test(t)
}

func TestAPI_PicksGuard_SameTeamAllowedInDifferentCompetition(t *testing.T) {
	headers := map[string]string{}
	var body bytes.Buffer

	scenario := tests.ApiScenario{
		Name:    "same team in different competition allowed",
		Method:  http.MethodPost,
		URL:     "/api/collections/picks/records",
		Body:    &body,
		Headers: headers,
		TestAppFactory: func(t testing.TB) *tests.TestApp {
			app := newTestAppForAPI(t)
			deleteMigrationDataTB(t, app)

			uid := createUserTB(t, app, "player@test.com", "Player", "One", false)
			headers["Authorization"] = generateToken(t, app, uid)

			compCol, _ := app.FindCollectionByNameOrId("competitions")

			cA := core.NewRecord(compCol)
			cA.Set("name", "Comp A")
			cA.Set("status", "active")
			cA.Set("start_week", 1)
			app.Save(cA)

			cB := core.NewRecord(compCol)
			cB.Set("name", "Comp B")
			cB.Set("status", "active")
			cB.Set("start_week", 1)
			app.Save(cB)

			dlCol, _ := app.FindCollectionByNameOrId("deadlines")
			dl := core.NewRecord(dlCol)
			dl.Set("week_number", 1)
			dl.Set("deadline_time", time.Now().Add(24*time.Hour).UTC().Format(time.RFC3339))
			dl.Set("is_closed", false)
			dl.Set("competition_id", cB.Id)
			app.Save(dl)

			teams, _ := app.FindRecordsByFilter("teams", "team_name = 'Arsenal'", "", 1, 0)
			arsenalID := teams[0].Id

			pickCol, _ := app.FindCollectionByNameOrId("picks")
			p := core.NewRecord(pickCol)
			p.Set("user_id", uid)
			p.Set("team_id", arsenalID)
			p.Set("week_number", 1)
			p.Set("competition_id", cA.Id)
			app.Save(p)

			// Request body: pick Arsenal in Comp B week 1 (should be allowed — different competition)
			body.WriteString(fmt.Sprintf(
				`{"user_id":"%s","team_id":"%s","week_number":1,"competition_id":"%s"}`,
				uid, arsenalID, cB.Id,
			))

			RegisterPicksGuard(app)
			return app
		},
		ExpectedStatus:  200,
		ExpectedContent: []string{`"collectionName":"picks"`}, // record created successfully
	}
	scenario.Test(t)
}

func TestAPI_PicksGuard_DeadlinePassedBlocksPick(t *testing.T) {
	headers := map[string]string{}
	var body bytes.Buffer

	scenario := tests.ApiScenario{
		Name:    "pick after deadline passed is blocked",
		Method:  http.MethodPost,
		URL:     "/api/collections/picks/records",
		Body:    &body,
		Headers: headers,
		TestAppFactory: func(t testing.TB) *tests.TestApp {
			app := newTestAppForAPI(t)
			deleteMigrationDataTB(t, app)

			uid := createUserTB(t, app, "player@test.com", "Player", "One", false)
			headers["Authorization"] = generateToken(t, app, uid)

			col, _ := app.FindCollectionByNameOrId("competitions")
			c := core.NewRecord(col)
			c.Set("name", "Comp")
			c.Set("status", "active")
			c.Set("start_week", 1)
			app.Save(c)

			dlCol, _ := app.FindCollectionByNameOrId("deadlines")
			dl := core.NewRecord(dlCol)
			dl.Set("week_number", 1)
			dl.Set("deadline_time", time.Now().Add(-24*time.Hour).UTC().Format(time.RFC3339))
			dl.Set("is_closed", false)
			dl.Set("competition_id", c.Id)
			app.Save(dl)

			teams, _ := app.FindRecordsByFilter("teams", "team_name = 'Arsenal'", "", 1, 0)
			arsenalID := teams[0].Id

			body.WriteString(fmt.Sprintf(
				`{"user_id":"%s","team_id":"%s","week_number":1,"competition_id":"%s"}`,
				uid, arsenalID, c.Id,
			))

			RegisterPicksGuard(app)
			return app
		},
		ExpectedStatus:  403,
		ExpectedContent: []string{`Deadline has passed`},
	}
	scenario.Test(t)
}

func TestAPI_PicksGuard_EliminatedPlayerBlocked(t *testing.T) {
	headers := map[string]string{}
	var body bytes.Buffer

	scenario := tests.ApiScenario{
		Name:    "eliminated player cannot pick",
		Method:  http.MethodPost,
		URL:     "/api/collections/picks/records",
		Body:    &body,
		Headers: headers,
		TestAppFactory: func(t testing.TB) *tests.TestApp {
			app := newTestAppForAPI(t)
			deleteMigrationDataTB(t, app)

			uid := createUserTB(t, app, "player@test.com", "Player", "One", false)
			headers["Authorization"] = generateToken(t, app, uid)

			col, _ := app.FindCollectionByNameOrId("competitions")
			c := core.NewRecord(col)
			c.Set("name", "Comp")
			c.Set("status", "active")
			c.Set("start_week", 1)
			app.Save(c)
			compID := c.Id

			teams, _ := app.FindRecordsByFilter("teams", "team_name = 'Arsenal'", "", 1, 0)
			arsenalID := teams[0].Id
			chelseaTeams, _ := app.FindRecordsByFilter("teams", "team_name = 'Chelsea'", "", 1, 0)
			chelseaID := chelseaTeams[0].Id
			liverpoolTeams, _ := app.FindRecordsByFilter("teams", "team_name = 'Liverpool'", "", 1, 0)
			liverpoolID := liverpoolTeams[0].Id

			// Week 1: player picked Chelsea (loser), Arsenal won
			pickCol, _ := app.FindCollectionByNameOrId("picks")
			p := core.NewRecord(pickCol)
			p.Set("user_id", uid)
			p.Set("team_id", chelseaID)
			p.Set("week_number", 1)
			p.Set("competition_id", compID)
			app.Save(p)

			wtCol, _ := app.FindCollectionByNameOrId("winning_teams")
			w := core.NewRecord(wtCol)
			w.Set("week_number", 1)
			w.Set("team_id", arsenalID)
			w.Set("competition_id", compID)
			app.Save(w)

			// Open deadline for week 2
			dlCol, _ := app.FindCollectionByNameOrId("deadlines")
			dl := core.NewRecord(dlCol)
			dl.Set("week_number", 2)
			dl.Set("deadline_time", time.Now().Add(24*time.Hour).UTC().Format(time.RFC3339))
			dl.Set("is_closed", false)
			dl.Set("competition_id", compID)
			app.Save(dl)

			// Try to pick Liverpool in week 2 — should be blocked (eliminated)
			body.WriteString(fmt.Sprintf(
				`{"user_id":"%s","team_id":"%s","week_number":2,"competition_id":"%s"}`,
				uid, liverpoolID, compID,
			))

			RegisterPicksGuard(app)
			return app
		},
		ExpectedStatus:  403,
		ExpectedContent: []string{`eliminated`},
	}
	scenario.Test(t)
}
