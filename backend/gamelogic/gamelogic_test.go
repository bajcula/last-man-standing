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
