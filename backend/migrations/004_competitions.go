package migrations

import (
	"log"

	"github.com/bajcula/last-man-standing/backend/services"
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
		// Use services.StartWeek so mock mode (MOCK_API=N) gets the right start week
		startWeek := services.StartWeek
		// If there are existing deadlines, use the minimum week instead
		existingDeadlines, _ := app.FindRecordsByFilter("deadlines", "id != ''", "week_number", 1, 0)
		if len(existingDeadlines) > 0 {
			startWeek = existingDeadlines[0].GetInt("week_number")
		}
		compRecord.Set("start_week", startWeek)
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
