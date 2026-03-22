package services

// MatchFetcher abstracts match data retrieval so it can be mocked for local dev.
type MatchFetcher interface {
	FetchRoundMatches(season string, round int) ([]APIMatch, error)
}

// Compile-time interface compliance checks.
var _ MatchFetcher = LiveFetcher{}

// TODO: uncomment after MockFetcher is created
// var _ MatchFetcher = (*MockFetcher)(nil)

// LiveFetcher calls the real TheSportsDB API.
type LiveFetcher struct{}

func (f LiveFetcher) FetchRoundMatches(season string, round int) ([]APIMatch, error) {
	return fetchRoundMatchesFromAPI(season, round)
}
