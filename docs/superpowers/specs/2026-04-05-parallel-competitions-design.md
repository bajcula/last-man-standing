# Parallel Competitions Design Spec

## Overview

Add support for multiple simultaneous competitions within the same Last Man Standing season. When the player pool thins (e.g., 50 → 6 survivors), an admin can start a new competition with all 50 players while the original 6 continue theirs. Players in multiple active competitions make one pick per competition per week.

## Data Model

### New collection: `competitions`

| Field | Type | Notes |
|-------|------|-------|
| `name` | text | e.g. "Round 1", "Round 2" |
| `status` | select | `active` or `ended` |
| `start_week` | number | First PL gameweek for this competition |
| `end_week` | number | Null while active, set when admin ends it |
| `created_by` | relation → users | Admin who created it |

### New collection: `competition_participants`

| Field | Type | Notes |
|-------|------|-------|
| `competition_id` | relation → competitions | |
| `user_id` | relation → users | |
| `is_eliminated` | bool | Elimination tracked per competition |

### Modified collections

Add `competition_id` (relation → competitions) to:

- **picks** — each pick belongs to one competition
- **deadlines** — each deadline is per-competition
- **winning_teams** — winners are shared across competitions (same real PL results), but tracked per competition for query simplicity

### Migration strategy

1. Create a "Round 1" competition record with `start_week` = 1, `status` = active
2. Backfill all existing picks, deadlines, and winning_teams with that competition's ID
3. Create competition_participants entries for all existing users
4. Zero data loss — existing game continues seamlessly under "Round 1"

### Used-team tracking

A player's used teams = all teams they've picked within that specific competition. The same team can be picked in different competitions. Enforced by querying picks WHERE `competition_id = X AND user_id = Y`.

## Backend Changes

### Cron (`hooks/gameweek.go`)

- `RunGameweekAutomation` iterates over all competitions WHERE `status = 'active'`
- For each active competition: create deadline, auto-pick unused teams, mark winners — all scoped by `competition_id`
- A player in 2 active competitions gets 2 auto-picks (one per competition)
- Winners use real PL results — same match outcomes applied per competition

### Picks guard (`hooks/picks_guard.go`)

- `enforceDeadline` reads `competition_id` from the pick record and scopes deadline lookup accordingly
- `isEliminated` checks elimination within that competition only
- Used-team validation: reject pick if player already used that team in the same competition (not across competitions)

### New admin endpoints

- `POST /api/competitions` — create a new competition
  - Body: `{ name, participant_user_ids: [] }`
  - Sets `start_week` to the next full gameweek
  - Bulk-inserts selected participants into `competition_participants`
- `POST /api/competitions/:id/end` — end a competition
  - Sets `status = 'ended'`, `end_week` = current week
  - Freezes all picks/deadlines for that competition
- `GET /api/competitions` — list all competitions (active first, then ended)
- `GET /api/competitions/:id` — single competition with participant count and winners

### Mock API (`dev_routes.go`)

- `/api/dev/advance` processes all active competitions (handled by cron changes)
- No additional mock endpoints needed

### Game logic (`gamelogic/`)

- Pure functions already take picks/winners arrays as input — no changes needed
- Callers filter by competition_id before passing data to game logic

## Frontend Changes

### Competition switcher (global)

- Dropdown or tab bar at the top of the app showing the user's active competitions
- Selected competition stored in React context; all components read from it
- If a player is in 2 active competitions, they see both and switch between them
- Players not in a competition don't see it in their switcher
- Default: first active competition (or most recently created)

### PickTeam.tsx

- All data fetched with `competition_id` filter on the selected competition
- "Already picked" badges scoped per competition
- Auto-assignment display scoped per competition
- Used teams list scoped per competition

### AllPlayersPicksHistory.tsx

- Filtered by selected competition
- Separate "Past Competitions" dropdown to browse ended competitions
- Ended competitions show final standings with winners highlighted (green row/badge)

### Admin.tsx

- **"Start New Competition" button** → modal with:
  - Competition name (text input)
  - Player checkboxes (all users listed, all checked by default, admin unchecks to exclude)
  - Confirm button
- **Active competitions list** with "End Competition" button on each
- **Ended competitions list** showing winners and final standings

### Competition history

- Browse all ended competitions across the season
- Each shows: name, weeks spanned, number of participants, winner(s)
- Click into one to see full pick history grid (reuses AllPlayersPicksHistory component)

## Edge Cases

- **Player in 0 active competitions**: Sees empty state with message
- **Admin ends last active competition**: App shows only historical view
- **Auto-pick with no unused teams**: Player has exhausted all 20 teams in that competition — they're effectively stuck (same as current behavior)
- **Competition started mid-season**: `start_week` ensures picks/deadlines only exist from that week forward
- **Deadline timing**: All active competitions share the same real PL match schedule, so deadlines align to the same kickoff times

## Non-goals

- Money tracking
- Player self-enrollment (admin selects participants)
- Cross-competition elimination (each competition is independent)
