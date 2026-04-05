package hooks

import (
	"log"
	"net/http"
	"strconv"

	"github.com/bajcula/last-man-standing/backend/services"
	"github.com/pocketbase/pocketbase/core"
)

// RegisterDevRoutes adds mock-only API endpoints for local simulation.
// Only call this when MOCK_API is set.
func RegisterDevRoutes(app core.App, fetcher *services.MockFetcher) {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.GET("/api/matches/{round}", func(e *core.RequestEvent) error {
			roundStr := e.Request.PathValue("round")
			round, err := strconv.Atoi(roundStr)
			if err != nil {
				return e.JSON(http.StatusBadRequest, map[string]string{"error": "invalid round"})
			}

			season := "2025-2026"
			matches, err := fetcher.FetchRoundMatches(season, round)
			if err != nil {
				return e.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
			}

			return e.JSON(http.StatusOK, map[string]any{"events": matches})
		})

		se.Router.POST("/api/dev/advance", func(e *core.RequestEvent) error {
			// Ensure DB is bootstrapped (creates initial deadline + auto-picks on first call; no-op after)
			RunGameweekAutomation(app, fetcher)

			oldWeek := fetcher.CurrentWeek()
			results := fetcher.Advance()

			// Close the deadline for the finished week so picks become visible
			closeDeadline(app, oldWeek)

			// Process the finished week (mark winners, create next deadline, auto-assign picks)
			RunGameweekAutomation(app, fetcher)

			type matchResult struct {
				Home   string `json:"home"`
				Away   string `json:"away"`
				Score  string `json:"score"`
				Winner string `json:"winner"`
			}

			var summaryResults []matchResult
			for _, m := range results {
				winner := "Draw"
				hs := services.ParseScore(m.HomeScore)
				as := services.ParseScore(m.AwayScore)
				if hs > as {
					winner = m.HomeTeam
				} else if as > hs {
					winner = m.AwayTeam
				}
				summaryResults = append(summaryResults, matchResult{
					Home:   m.HomeTeam,
					Away:   m.AwayTeam,
					Score:  m.HomeScore + "-" + m.AwayScore,
					Winner: winner,
				})
			}

			return e.JSON(http.StatusOK, map[string]any{
				"advanced_week": oldWeek,
				"results":       summaryResults,
				"next_week":     fetcher.CurrentWeek(),
			})
		})

		return se.Next()
	})
}

func closeDeadline(app core.App, week int) {
	deadlines, err := app.FindRecordsByFilter(
		"deadlines",
		"week_number = {:week}",
		"", 1, 0,
		map[string]any{"week": week},
	)
	if err != nil || len(deadlines) == 0 {
		return
	}
	d := deadlines[0]
	d.Set("is_closed", true)
	if err := app.Save(d); err != nil {
		log.Printf("[DEV] Failed to close deadline for week %d: %v", week, err)
	}
}
