package main

import (
	"log"
	"os"
	"strconv"
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
	if mockWeek := os.Getenv("MOCK_API"); mockWeek != "" {
		week, err := strconv.Atoi(mockWeek)
		if err != nil || week < 1 || week > 38 {
			log.Fatalf("[MOCK] MOCK_API must be a week number 1-38, got %q", mockWeek)
		}
		log.Printf("[MOCK] Starting simulation at week %d", week)
		services.StartWeek = week
		mockFetcher := services.NewMockFetcher(week)
		fetcher = mockFetcher
		hooks.RegisterDevRoutes(app, mockFetcher)
	} else {
		fetcher = services.LiveFetcher{}
	}

	hooks.RegisterGameweekCron(app, fetcher)
	hooks.RegisterPicksGuard(app)

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
