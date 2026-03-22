package services

import "time"

// MockFetcher returns canned match data for local development.
// Switch scenarios on the fly with SetScenario.
type MockFetcher struct {
	scenario string
}

func NewMockFetcher(scenario string) *MockFetcher {
	return &MockFetcher{scenario: scenario}
}

func (f *MockFetcher) SetScenario(scenario string) {
	f.scenario = scenario
}

func (f *MockFetcher) FetchRoundMatches(season string, round int) ([]APIMatch, error) {
	scenarios := MockScenarios()
	matches, ok := scenarios[f.scenario]
	if !ok {
		return []APIMatch{}, nil
	}
	return matches, nil
}

// MockScenarios returns the full corpus of canned match data.
// Each scenario is a slice of 10 matches using the project's seeded team names.
func MockScenarios() map[string][]APIMatch {
	tomorrow := time.Now().UTC().AddDate(0, 0, 1).Format("2006-01-02")
	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")

	fixtures := []struct {
		Home string
		Away string
	}{
		{"Arsenal", "Chelsea"},
		{"Aston Villa", "Bournemouth"},
		{"Brentford", "Brighton and Hove Albion"},
		{"Burnley", "Crystal Palace"},
		{"Everton", "Fulham"},
		{"Liverpool", "Manchester City"},
		{"Manchester United", "Newcastle United"},
		{"Nottingham Forest", "Sunderland"},
		{"Tottenham Hotspur", "West Ham United"},
		{"Wolverhampton Wanderers", "Leeds United"},
	}

	return map[string][]APIMatch{
		"all-finished": makeMatches(fixtures, yesterday, "15:00:00", func(i int) (string, string, string) {
			scores := [][2]string{
				{"2", "1"}, {"3", "0"}, {"1", "0"}, {"2", "1"}, {"0", "1"},
				{"4", "2"}, {"1", "3"}, {"2", "0"}, {"3", "1"}, {"0", "2"},
			}
			return "Match Finished", scores[i][0], scores[i][1]
		}),

		"pre-kickoff": makeMatches(fixtures, tomorrow, "15:00:00", func(i int) (string, string, string) {
			return "Not Started", "", ""
		}),

		"mid-week": makeMatches(fixtures, yesterday, "15:00:00", func(i int) (string, string, string) {
			if i < 5 {
				scores := [][2]string{
					{"2", "1"}, {"3", "0"}, {"1", "0"}, {"2", "1"}, {"0", "1"},
				}
				return "Match Finished", scores[i][0], scores[i][1]
			}
			return "Not Started", "", ""
		}),

		"all-draws": makeMatches(fixtures, yesterday, "15:00:00", func(i int) (string, string, string) {
			return "Match Finished", "1", "1"
		}),

		"with-postponed": makeMatches(fixtures, yesterday, "15:00:00", func(i int) (string, string, string) {
			if i >= 8 {
				return "Postponed", "", ""
			}
			scores := [][2]string{
				{"2", "1"}, {"3", "0"}, {"1", "0"}, {"2", "1"},
				{"0", "1"}, {"4", "2"}, {"1", "3"}, {"2", "0"},
			}
			return "Match Finished", scores[i][0], scores[i][1]
		}),
	}
}

func makeMatches(
	fixtures []struct{ Home, Away string },
	date, kickoff string,
	statusFn func(i int) (status, homeScore, awayScore string),
) []APIMatch {
	matches := make([]APIMatch, len(fixtures))
	for i, f := range fixtures {
		status, hs, as := statusFn(i)
		postponed := ""
		if status == "Postponed" {
			postponed = "yes"
		}
		matches[i] = APIMatch{
			HomeTeam:  f.Home,
			AwayTeam:  f.Away,
			HomeScore: hs,
			AwayScore: as,
			Status:    status,
			DateEvent: date,
			StrTime:   kickoff,
			Postponed: postponed,
		}
	}
	return matches
}

// ListScenarios returns the names of all available mock scenarios.
func ListScenarios() []string {
	scenarios := MockScenarios()
	names := make([]string, 0, len(scenarios))
	for k := range scenarios {
		names = append(names, k)
	}
	return names
}
