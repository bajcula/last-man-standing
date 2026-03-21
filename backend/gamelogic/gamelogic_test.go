package gamelogic

import (
	"testing"
	"time"
)

func TestGetMatchWinner(t *testing.T) {
	tests := []struct {
		name      string
		homeTeam  string
		awayTeam  string
		homeScore int
		awayScore int
		status    string
		want      string
	}{
		{"home win", "Arsenal", "Chelsea", 3, 1, "Match Finished", "Arsenal"},
		{"away win", "Arsenal", "Chelsea", 1, 3, "Match Finished", "Chelsea"},
		{"draw", "Arsenal", "Chelsea", 2, 2, "Match Finished", "Draw"},
		{"zero-zero draw", "Arsenal", "Chelsea", 0, 0, "Match Finished", "Draw"},
		{"not finished", "Arsenal", "Chelsea", 0, 0, "Not Started", ""},
		{"half time", "Arsenal", "Chelsea", 1, 0, "1H", ""},
		{"postponed", "Arsenal", "Chelsea", 0, 0, "Postponed", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GetMatchWinner(tt.homeTeam, tt.awayTeam, tt.homeScore, tt.awayScore, tt.status)
			if got != tt.want {
				t.Errorf("GetMatchWinner() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestIsUserEliminated(t *testing.T) {
	winners := []Winner{
		{TeamID: "arsenal_id", WeekNumber: 1},
		{TeamID: "villa_id", WeekNumber: 1},
		{TeamID: "chelsea_id", WeekNumber: 2},
		{TeamID: "city_id", WeekNumber: 2},
	}
	tests := []struct {
		name        string
		picks       []Pick
		winners     []Winner
		currentWeek int
		want        bool
	}{
		{"week 1 — nobody eliminated", []Pick{}, winners, 1, false},
		{"winning picks — not eliminated", []Pick{{TeamID: "arsenal_id", WeekNumber: 1}, {TeamID: "chelsea_id", WeekNumber: 2}}, winners, 3, false},
		{"losing pick — eliminated", []Pick{{TeamID: "arsenal_id", WeekNumber: 1}, {TeamID: "spurs_id", WeekNumber: 2}}, winners, 3, true},
		{"no pick for played week — eliminated", []Pick{{TeamID: "arsenal_id", WeekNumber: 1}}, winners, 3, true},
		{"skip weeks with no declared winners", []Pick{{TeamID: "arsenal_id", WeekNumber: 1}, {TeamID: "chelsea_id", WeekNumber: 3}}, []Winner{{TeamID: "arsenal_id", WeekNumber: 1}, {TeamID: "chelsea_id", WeekNumber: 3}}, 4, false},
		{"eliminated on first losing week", []Pick{{TeamID: "loser_id", WeekNumber: 1}, {TeamID: "chelsea_id", WeekNumber: 2}}, winners, 3, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsUserEliminated(tt.picks, tt.winners, tt.currentWeek)
			if got != tt.want {
				t.Errorf("IsUserEliminated() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGetFirstAvailableTeam(t *testing.T) {
	teams := []Team{
		{ID: "1", TeamName: "Chelsea", ShortName: "CHE"},
		{ID: "2", TeamName: "Aston Villa", ShortName: "AVL"},
		{ID: "3", TeamName: "Brighton and Hove Albion", ShortName: "BHA"},
		{ID: "4", TeamName: "Arsenal", ShortName: "ARS"},
	}
	tests := []struct {
		name    string
		usedIDs []string
		teams   []Team
		wantID  string
		wantNil bool
	}{
		{"no picks — returns Arsenal (first alpha)", []string{}, teams, "4", false},
		{"Arsenal used — returns Aston Villa", []string{"4"}, teams, "2", false},
		{"Arsenal+Villa used — returns Brighton", []string{"4", "2"}, teams, "3", false},
		{"all used — returns nil", []string{"1", "2", "3", "4"}, teams, "", true},
		{"empty teams — returns nil", []string{}, []Team{}, "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GetFirstAvailableTeam(tt.usedIDs, tt.teams)
			if tt.wantNil {
				if got != nil {
					t.Errorf("GetFirstAvailableTeam() = %v, want nil", got)
				}
				return
			}
			if got == nil {
				t.Fatal("GetFirstAvailableTeam() = nil, want non-nil")
			}
			if got.ID != tt.wantID {
				t.Errorf("GetFirstAvailableTeam().ID = %q, want %q", got.ID, tt.wantID)
			}
		})
	}
}

func TestGetCurrentSeason(t *testing.T) {
	tests := []struct {
		name string
		now  time.Time
		want string
	}{
		{"august 2025 — new season", time.Date(2025, 8, 1, 0, 0, 0, 0, time.UTC), "2025-2026"},
		{"december 2025 — same season", time.Date(2025, 12, 15, 0, 0, 0, 0, time.UTC), "2025-2026"},
		{"july 2026 — still prev season", time.Date(2026, 7, 31, 0, 0, 0, 0, time.UTC), "2025-2026"},
		{"march 2026 — mid-season", time.Date(2026, 3, 18, 0, 0, 0, 0, time.UTC), "2025-2026"},
		{"august 2026 — next season", time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC), "2026-2027"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GetCurrentSeason(tt.now)
			if got != tt.want {
				t.Errorf("GetCurrentSeason() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCalculateDeadline(t *testing.T) {
	now := time.Date(2026, 3, 18, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name    string
		matches []Match
		now     time.Time
		want    time.Time
	}{
		{"normal — 2hrs before earliest future kickoff", []Match{
			{DateEvent: "2026-03-20", StrTime: "15:00:00", Status: "Not Started", Postponed: ""},
			{DateEvent: "2026-03-21", StrTime: "17:30:00", Status: "Not Started", Postponed: ""},
		}, now, time.Date(2026, 3, 20, 13, 0, 0, 0, time.UTC)},
		{"skip past matches", []Match{
			{DateEvent: "2026-03-10", StrTime: "15:00:00", Status: "Match Finished", Postponed: ""},
			{DateEvent: "2026-03-22", StrTime: "12:30:00", Status: "Not Started", Postponed: ""},
		}, now, time.Date(2026, 3, 22, 10, 30, 0, 0, time.UTC)},
		{"skip postponed matches", []Match{
			{DateEvent: "2026-03-19", StrTime: "20:00:00", Status: "Not Started", Postponed: "yes"},
			{DateEvent: "2026-03-21", StrTime: "15:00:00", Status: "Not Started", Postponed: ""},
		}, now, time.Date(2026, 3, 21, 13, 0, 0, 0, time.UTC)},
		{"all past — fallback 7 days at 12:00 UTC", []Match{
			{DateEvent: "2026-03-10", StrTime: "15:00:00", Status: "Match Finished", Postponed: ""},
		}, now, time.Date(2026, 3, 25, 12, 0, 0, 0, time.UTC)},
		{"empty matches — fallback", []Match{}, now, time.Date(2026, 3, 25, 12, 0, 0, 0, time.UTC)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalculateDeadline(tt.matches, tt.now)
			if !got.Equal(tt.want) {
				t.Errorf("CalculateDeadline() = %v, want %v", got, tt.want)
			}
		})
	}
}
