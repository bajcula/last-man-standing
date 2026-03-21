package gamelogic

import (
	"fmt"
	"sort"
	"time"
)

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

// Match holds the fields needed for deadline calculation.
type Match struct {
	DateEvent string // "2026-03-20"
	StrTime   string // "15:00:00"
	Status    string // "Match Finished", "Not Started", etc.
	Postponed string // "yes" or ""
}

// DeadlineBufferHours is the number of hours before kickoff that picks close.
const DeadlineBufferHours = 2

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

// GetCurrentSeason returns the PL season string (e.g. "2025-2026") for the given time.
// The season starts in August and ends in July of the following year.
func GetCurrentSeason(now time.Time) string {
	startYear := now.Year()
	if now.Month() < time.August {
		startYear--
	}
	return fmt.Sprintf("%d-%d", startYear, startYear+1)
}

// CalculateDeadline returns the deadline time for picks, calculated as
// DeadlineBufferHours before the earliest future, non-postponed match kickoff.
// If no future matches exist, it falls back to 7 days from now at 12:00 UTC.
func CalculateDeadline(matches []Match, now time.Time) time.Time {
	var earliest *time.Time
	for _, m := range matches {
		if m.Postponed == "yes" {
			continue
		}
		strTime := m.StrTime
		if strTime == "" {
			strTime = "00:00:00"
		}
		ko, err := time.Parse("2006-01-02T15:04:05", m.DateEvent+"T"+strTime)
		if err != nil {
			continue
		}
		if ko.Before(now) {
			continue
		}
		if earliest == nil || ko.Before(*earliest) {
			earliest = &ko
		}
	}
	if earliest != nil {
		return earliest.Add(-time.Duration(DeadlineBufferHours) * time.Hour)
	}
	fallback := now.AddDate(0, 0, 7)
	return time.Date(fallback.Year(), fallback.Month(), fallback.Day(), 12, 0, 0, 0, time.UTC)
}
