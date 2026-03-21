package gamelogic

import "testing"

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
