package services

import (
	"sort"
	"testing"
)

func TestMockFetcher_AllFinished(t *testing.T) {
	mock := NewMockFetcher("all-finished")

	matches, err := mock.FetchRoundMatches("2025-2026", 30)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(matches) != 10 {
		t.Errorf("expected 10 matches, got %d", len(matches))
	}
	for _, m := range matches {
		if m.Status != "Match Finished" {
			t.Errorf("expected all Match Finished, got %q", m.Status)
		}
	}
}

func TestMockFetcher_PreKickoff(t *testing.T) {
	mock := NewMockFetcher("pre-kickoff")

	matches, err := mock.FetchRoundMatches("2025-2026", 30)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, m := range matches {
		if m.Status != "Not Started" {
			t.Errorf("expected all Not Started, got %q", m.Status)
		}
	}
}

func TestMockFetcher_MidWeek(t *testing.T) {
	mock := NewMockFetcher("mid-week")

	matches, err := mock.FetchRoundMatches("2025-2026", 30)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	finished := 0
	notStarted := 0
	for _, m := range matches {
		switch m.Status {
		case "Match Finished":
			finished++
		case "Not Started":
			notStarted++
		}
	}
	if finished == 0 || notStarted == 0 {
		t.Errorf("mid-week should have mix: %d finished, %d not started", finished, notStarted)
	}
}

func TestMockFetcher_UnknownScenario(t *testing.T) {
	mock := NewMockFetcher("nonexistent")

	matches, err := mock.FetchRoundMatches("2025-2026", 30)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(matches) != 0 {
		t.Errorf("unknown scenario should return empty, got %d", len(matches))
	}
}

func TestMockFetcher_SetScenario(t *testing.T) {
	mock := NewMockFetcher("pre-kickoff")
	matches, _ := mock.FetchRoundMatches("2025-2026", 30)
	for _, m := range matches {
		if m.Status != "Not Started" {
			t.Fatalf("expected Not Started")
		}
	}

	mock.SetScenario("all-finished")
	matches, _ = mock.FetchRoundMatches("2025-2026", 30)
	for _, m := range matches {
		if m.Status != "Match Finished" {
			t.Fatalf("expected Match Finished after switch, got %q", m.Status)
		}
	}
}

func TestListScenarios(t *testing.T) {
	names := ListScenarios()
	if len(names) == 0 {
		t.Fatal("expected at least one scenario")
	}
	sort.Strings(names)
	expected := []string{"all-draws", "all-finished", "mid-week", "pre-kickoff", "with-postponed"}
	if len(names) != len(expected) {
		t.Fatalf("expected %d scenarios, got %d: %v", len(expected), len(names), names)
	}
	for i, name := range names {
		if name != expected[i] {
			t.Errorf("scenario[%d] = %q, want %q", i, name, expected[i])
		}
	}
}
