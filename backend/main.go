package main

import (
	"log"
	"os"
	"strings"

	"github.com/bajcula/last-man-standing/backend/hooks"
	"github.com/bajcula/last-man-standing/backend/services"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	_ "github.com/bajcula/last-man-standing/backend/migrations"
)

func main() {
	app := pocketbase.New()

	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	var fetcher services.MatchFetcher
	if scenario := os.Getenv("MOCK_API"); scenario != "" {
		valid := false
		for _, s := range services.ListScenarios() {
			if s == scenario {
				valid = true
				break
			}
		}
		if !valid {
			log.Fatalf("[MOCK] Unknown scenario %q. Available: %v", scenario, services.ListScenarios())
		}
		log.Printf("[MOCK] Using mock API with scenario: %s", scenario)
		fetcher = services.NewMockFetcher(scenario)
	} else {
		fetcher = services.LiveFetcher{}
	}

	hooks.RegisterGameweekCron(app, fetcher)
	hooks.RegisterPicksGuard(app)

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
