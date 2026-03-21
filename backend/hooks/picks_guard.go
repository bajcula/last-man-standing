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

	// Filter out other users' picks for open weeks (non-admins only).
	// At this point e.Records and e.Result are already populated by PocketBase.
	// We modify both before e.Next() which enriches e.Records and sends e.Result as JSON.
	app.OnRecordsListRequest("picks").BindFunc(func(e *core.RecordsListRequestEvent) error {
		auth := e.Auth
		if auth == nil || auth.GetBool("isAdmin") {
			return e.Next()
		}

		// Find open (non-passed) deadline weeks
		now := time.Now().UTC()
		deadlines, err := app.FindRecordsByFilter("deadlines", "id != ''", "", 0, 0)
		if err != nil {
			return e.Next()
		}

		openWeeks := map[int]bool{}
		for _, d := range deadlines {
			deadlineTime := d.GetDateTime("deadline_time").Time()
			isClosed := d.GetBool("is_closed")
			if !isClosed && deadlineTime.After(now) {
				openWeeks[d.GetInt("week_number")] = true
			}
		}

		if len(openWeeks) == 0 {
			return e.Next()
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
