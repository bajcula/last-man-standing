package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		teams := []struct {
			Name      string
			ShortName string
		}{
			{"Arsenal", "ARS"},
			{"Aston Villa", "AVL"},
			{"Bournemouth", "BOU"},
			{"Brentford", "BRE"},
			{"Brighton and Hove Albion", "BHA"},
			{"Burnley", "BUR"},
			{"Chelsea", "CHE"},
			{"Crystal Palace", "CRY"},
			{"Everton", "EVE"},
			{"Fulham", "FUL"},
			{"Leeds United", "LEE"},
			{"Liverpool", "LIV"},
			{"Manchester City", "MCI"},
			{"Manchester United", "MUN"},
			{"Newcastle United", "NEW"},
			{"Nottingham Forest", "NFO"},
			{"Sunderland", "SUN"},
			{"Tottenham Hotspur", "TOT"},
			{"West Ham United", "WHU"},
			{"Wolverhampton Wanderers", "WOL"},
		}

		existing, _ := app.FindRecordsByFilter("teams", "id != ''", "", 1, 0)
		if len(existing) > 0 {
			return nil
		}

		collection, err := app.FindCollectionByNameOrId("teams")
		if err != nil {
			return err
		}

		for _, t := range teams {
			record := core.NewRecord(collection)
			record.Set("team_name", t.Name)
			record.Set("team_short_name", t.ShortName)
			if err := app.Save(record); err != nil {
				return err
			}
		}
		return nil
	}, func(app core.App) error {
		records, err := app.FindRecordsByFilter("teams", "id != ''", "", 0, 0)
		if err != nil {
			return nil
		}
		for _, r := range records {
			if err := app.Delete(r); err != nil {
				return err
			}
		}
		return nil
	})
}
