package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		authRule := types.Pointer(`@request.auth.id != ""`)
		adminRule := types.Pointer(`@request.auth.isAdmin = true`)

		// --- teams (reference data: read=auth, write=admin) ---
		teams, err := app.FindCollectionByNameOrId("teams")
		if err != nil {
			return err
		}
		teams.ListRule = authRule
		teams.ViewRule = authRule
		teams.CreateRule = adminRule
		teams.UpdateRule = adminRule
		teams.DeleteRule = adminRule
		if err := app.Save(teams); err != nil {
			return err
		}

		// --- picks (user-specific: read=auth, create/update=own, delete=admin) ---
		picks, err := app.FindCollectionByNameOrId("picks")
		if err != nil {
			return err
		}
		picks.ListRule = authRule
		picks.ViewRule = authRule
		picks.CreateRule = types.Pointer(`@request.auth.id != "" && @request.body.user_id = @request.auth.id`)
		picks.UpdateRule = types.Pointer(`@request.auth.id != "" && user_id = @request.auth.id`)
		picks.DeleteRule = adminRule
		if err := app.Save(picks); err != nil {
			return err
		}

		// --- deadlines (system data: read=auth, write=admin) ---
		deadlines, err := app.FindCollectionByNameOrId("deadlines")
		if err != nil {
			return err
		}
		deadlines.ListRule = authRule
		deadlines.ViewRule = authRule
		deadlines.CreateRule = adminRule
		deadlines.UpdateRule = adminRule
		deadlines.DeleteRule = adminRule
		if err := app.Save(deadlines); err != nil {
			return err
		}

		// --- winning_teams (system data: read=auth, write=admin) ---
		winningTeams, err := app.FindCollectionByNameOrId("winning_teams")
		if err != nil {
			return err
		}
		winningTeams.ListRule = authRule
		winningTeams.ViewRule = authRule
		winningTeams.CreateRule = adminRule
		winningTeams.UpdateRule = adminRule
		winningTeams.DeleteRule = adminRule
		if err := app.Save(winningTeams); err != nil {
			return err
		}

		// --- users (auth collection: read=auth, update=own or admin, delete=admin) ---
		users, err := app.FindCollectionByNameOrId("_pb_users_auth_")
		if err != nil {
			return err
		}
		users.ListRule = authRule
		users.ViewRule = authRule
		users.UpdateRule = types.Pointer(`@request.auth.id = id || @request.auth.isAdmin = true`)
		users.DeleteRule = adminRule
		if err := app.Save(users); err != nil {
			return err
		}

		return nil
	}, func(app core.App) error {
		// Revert: set all rules back to open (empty string = no restrictions)
		openRule := types.Pointer("")

		collections := []string{"teams", "picks", "deadlines", "winning_teams"}
		for _, name := range collections {
			col, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				return err
			}
			col.ListRule = openRule
			col.ViewRule = openRule
			col.CreateRule = openRule
			col.UpdateRule = openRule
			col.DeleteRule = openRule
			if err := app.Save(col); err != nil {
				return err
			}
		}

		users, err := app.FindCollectionByNameOrId("_pb_users_auth_")
		if err != nil {
			return err
		}
		users.ListRule = openRule
		users.ViewRule = openRule
		users.UpdateRule = openRule
		users.DeleteRule = openRule
		return app.Save(users)
	})
}
