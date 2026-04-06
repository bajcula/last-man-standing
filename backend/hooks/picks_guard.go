package hooks

import (
	"strconv"
	"time"

	"github.com/bajcula/last-man-standing/backend/gamelogic"
	"github.com/pocketbase/pocketbase/core"
)

func RegisterPicksGuard(app core.App) {
	// Block pick create/update after deadline has passed
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

	// Filter out other users' picks for open weeks (non-admins only).
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

		// Remove other users' picks for open weeks
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

	// Admins bypass all checks
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
