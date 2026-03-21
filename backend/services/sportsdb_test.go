package services

import (
	"testing"
	"time"
)

func TestFindTeamByApiName(t *testing.T) {
	teams := []Team{
		{ID: "1", TeamName: "Arsenal"},
		{ID: "2", TeamName: "Manchester United"},
		{ID: "3", TeamName: "Wolverhampton Wanderers"},
		{ID: "4", TeamName: "Brighton and Hove Albion"},
		{ID: "5", TeamName: "Nottingham Forest"},
		{ID: "6", TeamName: "Newcastle United"},
	}
	tests := []struct {
		name    string
		apiName string
		wantID  string
		wantNil bool
	}{
		{"exact match", "Arsenal", "1", false},
		{"mapped: Man United", "Man United", "2", false},
		{"mapped: Wolves", "Wolves", "3", false},
		{"mapped: Brighton", "Brighton", "4", false},
		{"mapped: Nottm Forest", "Nottm Forest", "5", false},
		{"mapped: Nott'm Forest", "Nott'm Forest", "5", false},
		{"mapped: Newcastle", "Newcastle", "6", false},
		{"not found", "Fake FC", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FindTeamByApiName(tt.apiName, teams)
			if tt.wantNil {
				if got != nil {
					t.Errorf("FindTeamByApiName(%q) = %v, want nil", tt.apiName, got)
				}
				return
			}
			if got == nil {
				t.Fatalf("FindTeamByApiName(%q) = nil, want ID %q", tt.apiName, tt.wantID)
			}
			if got.ID != tt.wantID {
				t.Errorf("FindTeamByApiName(%q).ID = %q, want %q", tt.apiName, got.ID, tt.wantID)
			}
		})
	}
}

func TestIsSkippedStatus(t *testing.T) {
	tests := []struct {
		status string
		want   bool
	}{
		{"Postponed", true},
		{"Cancelled", true},
		{"Abandoned", true},
		{"Awarded", true},
		{"Match Finished", false},
		{"Not Started", false},
		{"1H", false},
	}
	for _, tt := range tests {
		t.Run(tt.status, func(t *testing.T) {
			if got := IsSkippedStatus(tt.status); got != tt.want {
				t.Errorf("IsSkippedStatus(%q) = %v, want %v", tt.status, got, tt.want)
			}
		})
	}
}

func TestGetPollingWindow(t *testing.T) {
	tests := []struct {
		name       string
		matches    []APIMatch
		now        time.Time
		wantActive bool
		wantReason string
	}{
		{"no matches", []APIMatch{}, time.Date(2026, 3, 20, 15, 0, 0, 0, time.UTC), false, "no matches"},
		{"before first kickoff", []APIMatch{{DateEvent: "2026-03-20", StrTime: "15:00:00", Status: "Not Started"}}, time.Date(2026, 3, 20, 10, 0, 0, 0, time.UTC), false, "before first kickoff"},
		{"during match window", []APIMatch{{DateEvent: "2026-03-20", StrTime: "15:00:00", Status: "Not Started"}}, time.Date(2026, 3, 20, 16, 0, 0, 0, time.UTC), true, ""},
		{"past results window", []APIMatch{{DateEvent: "2026-03-20", StrTime: "15:00:00", Status: "Match Finished"}}, time.Date(2026, 3, 20, 21, 0, 0, 0, time.UTC), false, "past results window"},
		{"all postponed", []APIMatch{{DateEvent: "2026-03-20", StrTime: "15:00:00", Status: "Postponed"}}, time.Date(2026, 3, 20, 16, 0, 0, 0, time.UTC), false, "all matches postponed/cancelled"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			active, reason := GetPollingWindow(tt.matches, tt.now)
			if active != tt.wantActive {
				t.Errorf("active = %v, want %v", active, tt.wantActive)
			}
			if reason != tt.wantReason {
				t.Errorf("reason = %q, want %q", reason, tt.wantReason)
			}
		})
	}
}

func TestParseScore(t *testing.T) {
	tests := []struct {
		input string
		want  int
	}{
		{"3", 3},
		{"0", 0},
		{"", 0},
		{"abc", 0},
		{" 2 ", 2},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			if got := ParseScore(tt.input); got != tt.want {
				t.Errorf("ParseScore(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}
