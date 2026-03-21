package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	LeagueID           = "4328" // English Premier League
	APIBase            = "https://www.thesportsdb.com/api/v1/json/3"
	APITimeout         = 30 * time.Second
	ResultsBufferHours = 5
	StartWeek          = 30
)

var SkipStatuses = map[string]bool{
	"Postponed": true,
	"Cancelled": true,
	"Abandoned": true,
	"Awarded":   true,
}

func IsSkippedStatus(status string) bool {
	return SkipStatuses[status]
}

type APIMatch struct {
	HomeTeam  string `json:"strHomeTeam"`
	AwayTeam  string `json:"strAwayTeam"`
	HomeScore string `json:"intHomeScore"`
	AwayScore string `json:"intAwayScore"`
	Status    string `json:"strStatus"`
	DateEvent string `json:"dateEvent"`
	StrTime   string `json:"strTime"`
	Postponed string `json:"strPostponed"`
}

type RoundResponse struct {
	Events []APIMatch `json:"events"`
}

var TeamNameMap = map[string]string{
	"Man United":    "Manchester United",
	"Man City":      "Manchester City",
	"Newcastle":     "Newcastle United",
	"West Ham":      "West Ham United",
	"Tottenham":     "Tottenham Hotspur",
	"Spurs":         "Tottenham Hotspur",
	"Leicester":     "Leicester City",
	"Wolves":        "Wolverhampton Wanderers",
	"Wolverhampton": "Wolverhampton Wanderers",
	"Nottm Forest":  "Nottingham Forest",
	"Brighton":      "Brighton and Hove Albion",
	"Nott'm Forest": "Nottingham Forest",
}

type Team struct {
	ID       string
	TeamName string
}

func FindTeamByApiName(apiName string, teams []Team) *Team {
	if mapped, ok := TeamNameMap[apiName]; ok {
		for i := range teams {
			if teams[i].TeamName == mapped {
				return &teams[i]
			}
		}
	}
	for i := range teams {
		if teams[i].TeamName == apiName {
			return &teams[i]
		}
	}
	for i := range teams {
		tn := teams[i].TeamName
		if strings.Contains(tn, apiName) {
			return &teams[i]
		}
		parts := strings.SplitN(tn, " ", 2)
		if len(parts) > 0 && strings.Contains(apiName, parts[0]) {
			return &teams[i]
		}
	}
	return nil
}

func FetchRoundMatches(season string, round int) ([]APIMatch, error) {
	url := fmt.Sprintf("%s/eventsround.php?id=%s&r=%d&s=%s", APIBase, LeagueID, round, season)
	client := &http.Client{Timeout: APITimeout}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response body: %w", err)
	}
	var result RoundResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parsing JSON: %w", err)
	}
	if result.Events == nil {
		return []APIMatch{}, nil
	}
	return result.Events, nil
}

func GetPollingWindow(matches []APIMatch, now time.Time) (bool, string) {
	if len(matches) == 0 {
		return false, "no matches"
	}
	var earliest, latest *time.Time
	for _, m := range matches {
		if IsSkippedStatus(m.Status) {
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
		if earliest == nil || ko.Before(*earliest) {
			earliest = &ko
		}
		if latest == nil || ko.After(*latest) {
			latest = &ko
		}
	}
	if earliest == nil || latest == nil {
		return false, "all matches postponed/cancelled"
	}
	activeEnd := latest.Add(time.Duration(ResultsBufferHours) * time.Hour)
	if now.Before(*earliest) {
		return false, "before first kickoff"
	}
	if now.After(activeEnd) {
		return false, "past results window"
	}
	return true, ""
}

func ParseScore(s string) int {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return 0
	}
	return n
}
