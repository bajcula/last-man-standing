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
				"participants": added,
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
