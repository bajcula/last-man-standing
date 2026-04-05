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

	hasDeadlines := false
	existing, _ := app.FindRecordsByFilter("deadlines", "id != ''", "", 1, 0)
	if len(existing) > 0 {
		hasDeadlines = true
	}

	now := time.Now().UTC()
	season := gamelogic.GetCurrentSeason(now)

	if !hasDeadlines {
		log.Printf("[AUTOMATION] First run - initializing at week %d", services.StartWeek)
		createDeadline(app, services.StartWeek, season, fetcher)
		autoAssignPicks(app, services.StartWeek)
		log.Println("[AUTOMATION] Initial setup complete")
		return
	}

	currentWeek := getCurrentWeek(app)
	log.Printf("[AUTOMATION] Cron tick - week %d", currentWeek)

	if weekAlreadyProcessed(app, currentWeek) {
		log.Printf("[AUTOMATION] Week %d done. Ensuring next week ready.", currentWeek)
		ensureNextWeekReady(app, currentWeek, season, fetcher)
		return
	}

	matches, err := fetcher.FetchRoundMatches(season, currentWeek)
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
		ensureNextWeekReady(app, currentWeek, season, fetcher)
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
	return records[0].GetInt("week_number")
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

func createDeadline(app core.App, weekNumber int, season string, fetcher services.MatchFetcher) {
	existing, _ := app.FindRecordsByFilter("deadlines", "week_number = "+strconv.Itoa(weekNumber), "", 1, 0)
	if len(existing) > 0 {
		log.Printf("[AUTOMATION] Deadline for week %d already exists, skipping.", weekNumber)
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
	for _, user := range allUsers {
		uid := user.Id
		existing, _ := app.FindRecordsByFilter(
			"picks",
			"user_id = '"+uid+"' && week_number = "+strconv.Itoa(weekNumber),
			"", 1, 0,
		)
		if len(existing) > 0 {
			continue
		}
		userPickRecords, _ := app.FindRecordsByFilter("picks", "user_id = '"+uid+"'", "", 0, 0)
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

func ensureNextWeekReady(app core.App, currentWeek int, season string, fetcher services.MatchFetcher) {
	nextWeek := currentWeek + 1
	existing, _ := app.FindRecordsByFilter("deadlines", "week_number = "+strconv.Itoa(nextWeek), "", 1, 0)
	if len(existing) == 0 {
		createDeadline(app, nextWeek, season, fetcher)
	}
	autoAssignPicks(app, nextWeek)
}
