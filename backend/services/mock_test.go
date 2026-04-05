package services

import (
	"testing"
)

func TestNewMockFetcher(t *testing.T) {
	mock := NewMockFetcher(25)
	if mock.CurrentWeek() != 25 {
		t.Errorf("expected currentWeek 25, got %d", mock.CurrentWeek())
	}
}

func TestMockFetcher_FetchNotStarted(t *testing.T) {
	mock := NewMockFetcher(25)

	matches, err := mock.FetchRoundMatches("2025-2026", 25)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(matches) != 10 {
		t.Errorf("expected 10 matches, got %d", len(matches))
	}
	for _, m := range matches {
		if m.Status != "Not Started" {
			t.Errorf("expected Not Started, got %q", m.Status)
		}
	}
}

func TestMockFetcher_FetchPastWeek(t *testing.T) {
	mock := NewMockFetcher(25)

	matches, err := mock.FetchRoundMatches("2025-2026", 24)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(matches) != 0 {
		t.Errorf("past weeks should return empty, got %d", len(matches))
	}
}

func TestMockFetcher_FetchFutureWeek(t *testing.T) {
	mock := NewMockFetcher(25)

	matches, err := mock.FetchRoundMatches("2025-2026", 26)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(matches) != 10 {
		t.Errorf("expected 10 matches for future week, got %d", len(matches))
	}
	for _, m := range matches {
		if m.Status != "Not Started" {
			t.Errorf("expected Not Started for future week, got %q", m.Status)
		}
	}
}

func TestMockFetcher_Advance(t *testing.T) {
	mock := NewMockFetcher(25)

	results := mock.Advance()
	if len(results) != 10 {
		t.Fatalf("expected 10 results, got %d", len(results))
	}
	for _, m := range results {
		if m.Status != "Match Finished" {
			t.Errorf("expected Match Finished after advance, got %q", m.Status)
		}
	}

	if mock.CurrentWeek() != 26 {
		t.Errorf("expected currentWeek 26 after advance, got %d", mock.CurrentWeek())
	}

	matches, _ := mock.FetchRoundMatches("2025-2026", 25)
	for _, m := range matches {
		if m.Status != "Match Finished" {
			t.Errorf("week 25 should be finished after advance, got %q", m.Status)
		}
	}

	matches, _ = mock.FetchRoundMatches("2025-2026", 26)
	for _, m := range matches {
		if m.Status != "Not Started" {
			t.Errorf("week 26 should be Not Started, got %q", m.Status)
		}
	}
}

func TestMockFetcher_AdvanceMultiple(t *testing.T) {
	mock := NewMockFetcher(25)

	mock.Advance()
	mock.Advance()
	mock.Advance()

	if mock.CurrentWeek() != 28 {
		t.Errorf("expected currentWeek 28, got %d", mock.CurrentWeek())
	}

	for week := 25; week <= 27; week++ {
		matches, _ := mock.FetchRoundMatches("2025-2026", week)
		for _, m := range matches {
			if m.Status != "Match Finished" {
				t.Errorf("week %d should be finished, got %q", week, m.Status)
			}
		}
	}
}

func TestMockFetcher_RandomResults(t *testing.T) {
	mock := NewMockFetcher(25)
	results := mock.Advance()

	hasWinner := false
	for _, m := range results {
		hs := ParseScore(m.HomeScore)
		as := ParseScore(m.AwayScore)
		if hs != as {
			hasWinner = true
		}
	}
	if !hasWinner {
		t.Error("expected at least one non-draw result")
	}
}

func TestMockFetcher_Deterministic(t *testing.T) {
	mock1 := NewMockFetcher(25)
	mock2 := NewMockFetcher(25)

	r1 := mock1.Advance()
	r2 := mock2.Advance()

	for i := range r1 {
		if r1[i].HomeScore != r2[i].HomeScore || r1[i].AwayScore != r2[i].AwayScore {
			t.Errorf("match %d: results differ between runs (%s-%s vs %s-%s)",
				i, r1[i].HomeScore, r1[i].AwayScore, r2[i].HomeScore, r2[i].AwayScore)
		}
	}
}
