package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		openRule := types.Pointer("")

		// --- teams ---
		teams := core.NewBaseCollection("teams")
		teams.ListRule = openRule
		teams.ViewRule = openRule
		teams.CreateRule = openRule
		teams.UpdateRule = openRule
		teams.DeleteRule = openRule
		teams.Fields.Add(
			&core.TextField{Name: "team_name", Required: true},
			&core.TextField{Name: "team_short_name", Required: true},
		)
		if err := app.Save(teams); err != nil {
			return err
		}

		// --- picks ---
		picks := core.NewBaseCollection("picks")
		picks.ListRule = openRule
		picks.ViewRule = openRule
		picks.CreateRule = openRule
		picks.UpdateRule = openRule
		picks.DeleteRule = openRule
		picks.Fields.Add(
			&core.RelationField{
				Name:          "user_id",
				CollectionId:  "_pb_users_auth_",
				MaxSelect:     1,
				CascadeDelete: false,
			},
			&core.RelationField{
				Name:          "team_id",
				CollectionId:  teams.Id,
				MaxSelect:     1,
				CascadeDelete: false,
			},
			&core.NumberField{Name: "week_number", Required: true},
		)
		if err := app.Save(picks); err != nil {
			return err
		}

		// --- deadlines ---
		deadlines := core.NewBaseCollection("deadlines")
		deadlines.ListRule = openRule
		deadlines.ViewRule = openRule
		deadlines.CreateRule = openRule
		deadlines.UpdateRule = openRule
		deadlines.DeleteRule = openRule
		deadlines.Fields.Add(
			&core.NumberField{Name: "week_number", Required: true},
			&core.DateField{Name: "deadline_time", Required: true},
			&core.BoolField{Name: "is_closed"},
		)
		if err := app.Save(deadlines); err != nil {
			return err
		}

		// --- winning_teams ---
		winningTeams := core.NewBaseCollection("winning_teams")
		winningTeams.ListRule = openRule
		winningTeams.ViewRule = openRule
		winningTeams.CreateRule = openRule
		winningTeams.UpdateRule = openRule
		winningTeams.DeleteRule = openRule
		winningTeams.Fields.Add(
			&core.NumberField{Name: "week_number", Required: true},
			&core.RelationField{
				Name:          "team_id",
				CollectionId:  teams.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: false,
			},
		)
		if err := app.Save(winningTeams); err != nil {
			return err
		}

		// --- users (modify existing auth collection) ---
		users, err := app.FindCollectionByNameOrId("_pb_users_auth_")
		if err != nil {
			return err
		}
		users.ListRule = openRule
		users.ViewRule = openRule
		users.UpdateRule = openRule
		users.DeleteRule = openRule
		users.Fields.Add(
			&core.TextField{Name: "first_name", Required: true, Min: 2},
			&core.TextField{Name: "last_name", Required: true, Min: 2},
			&core.BoolField{Name: "isAdmin"},
		)
		return app.Save(users)
	}, func(app core.App) error {
		for _, name := range []string{"winning_teams", "picks", "deadlines", "teams"} {
			if c, err := app.FindCollectionByNameOrId(name); err == nil {
				if err := app.Delete(c); err != nil {
					return err
				}
			}
		}
		return nil
	})
}
