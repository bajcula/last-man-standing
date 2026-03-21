package gamelogic

import "sort"

// Pick represents a user's team pick for a week.
type Pick struct {
	TeamID     string
	WeekNumber int
}

// Winner represents a winning team for a week.
type Winner struct {
	TeamID     string
	WeekNumber int
}

// Team represents a PL team.
type Team struct {
	ID        string
	TeamName  string
	ShortName string
}

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

// IsUserEliminated checks whether a user has been eliminated based on their
// picks and the declared winners for all weeks before currentWeek.
func IsUserEliminated(userPicks []Pick, allWinners []Winner, currentWeek int) bool {
	if currentWeek <= 1 {
		return false
	}
	for week := 1; week < currentWeek; week++ {
		var weekWinners []Winner
		for _, w := range allWinners {
			if w.WeekNumber == week {
				weekWinners = append(weekWinners, w)
			}
		}
		if len(weekWinners) == 0 {
			continue
		}
		var pickTeamID string
		found := false
		for _, p := range userPicks {
			if p.WeekNumber == week {
				pickTeamID = p.TeamID
				found = true
				break
			}
		}
		if !found {
			return true
		}
		won := false
		for _, w := range weekWinners {
			if w.TeamID == pickTeamID {
				won = true
				break
			}
		}
		if !won {
			return true
		}
	}
	return false
}

// GetFirstAvailableTeam returns the first team (alphabetically by TeamName)
// that is not in the usedTeamIDs set, or nil if all teams are used.
func GetFirstAvailableTeam(usedTeamIDs []string, allTeams []Team) *Team {
	if len(allTeams) == 0 {
		return nil
	}
	sorted := make([]Team, len(allTeams))
	copy(sorted, allTeams)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].TeamName < sorted[j].TeamName
	})
	usedSet := make(map[string]bool, len(usedTeamIDs))
	for _, id := range usedTeamIDs {
		usedSet[id] = true
	}
	for i := range sorted {
		if !usedSet[sorted[i].ID] {
			return &sorted[i]
		}
	}
	return nil
}
