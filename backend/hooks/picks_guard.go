package hooks

import (
	"time"

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

	// Filter out other users' picks for open weeks (non-admins only)
	app.OnRecordsListRequest("picks").BindFunc(func(e *core.RecordsListRequestEvent) error {
		if err := e.Next(); err != nil {
			return err
		}

		auth := e.Auth
		if auth == nil {
			return nil
		}

		// Admins see everything
		if auth.GetBool("isAdmin") {
			return nil
		}

		// Find open (non-passed) deadline weeks
		now := time.Now().UTC()
		deadlines, err := app.FindRecordsByFilter("deadlines", "id != ''", "", 0, 0)
		if err != nil {
			return nil
		}

		openWeeks := map[int]bool{}
		for _, d := range deadlines {
			deadlineTime := d.GetDateTime("deadline_time").Time()
			isClosed := d.GetBool("is_closed")
			if !isClosed && deadlineTime.After(now) {
				openWeeks[d.GetInt("week_number")] = true
			}
		}

		// If no open weeks, nothing to filter
		if len(openWeeks) == 0 {
			return nil
		}

		// Remove other users' picks for open weeks
		filtered := make([]*core.Record, 0, len(e.Records))
		for _, r := range e.Records {
			week := r.GetInt("week_number")
			isOwn := r.GetString("user_id") == auth.Id
			if isOwn || !openWeeks[week] {
				filtered = append(filtered, r)
			}
		}
		e.Records = filtered

		return nil
	})
}

func enforceDeadline(app core.App, e *core.RecordRequestEvent) error {
	auth := e.Auth
	if auth == nil {
		return e.BadRequestError("Authentication required", nil)
	}

	// Admins bypass deadline check
	if auth.GetBool("isAdmin") {
		return nil
	}

	weekNum := e.Record.GetInt("week_number")
	if weekNum == 0 {
		return nil
	}

	deadlines, err := app.FindRecordsByFilter(
		"deadlines",
		"week_number = {:week}",
		"",
		1,
		0,
		map[string]any{"week": weekNum},
	)
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
