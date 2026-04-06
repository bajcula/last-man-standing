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
