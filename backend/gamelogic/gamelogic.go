package gamelogic

// GetMatchWinner returns the winning team name, "Draw" for draws,
// or "" if the match is not finished.
func GetMatchWinner(homeTeam, awayTeam string, homeScore, awayScore int, status string) string {
	if status != "Match Finished" {
		return ""
	}
	if homeScore > awayScore {
		return homeTeam
	}
	if awayScore > homeScore {
		return awayTeam
	}
	return "Draw"
}
