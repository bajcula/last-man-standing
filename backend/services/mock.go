package services

import (
	"math/rand"
	"strconv"
	"sync"
	"time"
)

var fixtures = []struct {
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

// MockFetcher is a stateful mock for end-to-end local simulation.
type MockFetcher struct {
	mu          sync.Mutex
	startWeek   int
	currentWeek int
	weekStates  map[int][]APIMatch
}

func NewMockFetcher(startWeek int) *MockFetcher {
	return &MockFetcher{
		startWeek:   startWeek,
		currentWeek: startWeek,
		weekStates:  make(map[int][]APIMatch),
	}
}

func (f *MockFetcher) CurrentWeek() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.currentWeek
}

func (f *MockFetcher) FetchRoundMatches(season string, round int) ([]APIMatch, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if round < f.startWeek {
		return []APIMatch{}, nil
	}

	if matches, ok := f.weekStates[round]; ok {
		return matches, nil
	}

	matches := generateNotStartedMatches()
	f.weekStates[round] = matches
	return matches, nil
}

// Advance finalizes the current week with random scores and moves to the next week.
func (f *MockFetcher) Advance() []APIMatch {
	f.mu.Lock()
	defer f.mu.Unlock()

	week := f.currentWeek

	if _, ok := f.weekStates[week]; !ok {
		f.weekStates[week] = generateNotStartedMatches()
	}

	rng := rand.New(rand.NewSource(int64(week)))
	matches := f.weekStates[week]
	for i := range matches {
		matches[i] = randomizeResult(matches[i], rng)
	}
	f.weekStates[week] = matches

	f.currentWeek = week + 1
	return matches
}

func generateNotStartedMatches() []APIMatch {
	tomorrow := time.Now().UTC().AddDate(0, 0, 1).Format("2006-01-02")
	matches := make([]APIMatch, len(fixtures))
	for i, fix := range fixtures {
		matches[i] = APIMatch{
			HomeTeam:  fix.Home,
			AwayTeam:  fix.Away,
			HomeScore: "",
			AwayScore: "",
			Status:    "Not Started",
			DateEvent: tomorrow,
			StrTime:   "15:00:00",
			Postponed: "",
		}
	}
	return matches
}

func randomizeResult(m APIMatch, rng *rand.Rand) APIMatch {
	roll := rng.Intn(100)
	var hs, as int
	switch {
	case roll < 40: // home win
		hs = rng.Intn(4) + 1
		as = rng.Intn(hs)
	case roll < 70: // away win
		as = rng.Intn(4) + 1
		hs = rng.Intn(as)
	default: // draw
		hs = rng.Intn(4)
		as = hs
	}

	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	m.HomeScore = strconv.Itoa(hs)
	m.AwayScore = strconv.Itoa(as)
	m.Status = "Match Finished"
	m.DateEvent = yesterday
	return m
}
