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
