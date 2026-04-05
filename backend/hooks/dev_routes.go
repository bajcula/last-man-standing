package hooks

import (
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
			oldWeek := fetcher.CurrentWeek()
			results := fetcher.Advance()

			// Run the cron automation to process the finished week
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
