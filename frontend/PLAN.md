# Last Man Standing — Master Plan

---

## PRIORITY 0: Foundation Refactor — API Alignment, Postponements & Automation Resilience

### Why This Comes First

The app is now automated via a PocketBase cron hook that fetches match data from TheSportsDB API, marks winners, creates deadlines, and auto-assigns picks. But the Premier League schedule is messy — matches get rescheduled, postponed, and moved between gameweeks. The automation and frontend must handle these real-world scenarios or the game breaks.

### Current State

- **Backend**: PocketBase with cron hook (`pb_hooks/gameweek_automation.pb.js`) running every minute (testing) / 30 min (production)
- **Data source**: TheSportsDB API — returns matches grouped by round number, each with `dateEvent`, `strTime`, `strStatus`
- **DB team names**: Were short names (`Man. City`, `Wolves`, `Brighton`) — now migrated to full API names (`Manchester City`, `Wolverhampton Wanderers`, `Brighton and Hove Albion`) via seed migration
- **Docker**: `docker-compose.yml` with PocketBase + frontend containers for local dev/testing
- **Pick model**: User picks ONE team per week. Team wins any match that week → user survives. Can't reuse a team across the season.

### Problem 1: Team Name Mismatch (DB vs API)

**What**: The DB had short/informal team names that didn't match what TheSportsDB returns. The automation couldn't find teams like "Arsenal", "Newcastle United", "Brighton and Hove Albion" in the DB.

**Fix (done)**: Created seed migration (`pb_migrations/1756200000_seed_teams.js`) with all 20 PL teams using exact API names. Updated `TEAM_NAME_MAP` in the hook to only contain alternate/nickname mappings.

**Frontend impact**: Any place that displays `team_name` from the DB will now show the full name (e.g., "Wolverhampton Wanderers" instead of "Wolves"). The `team_short_name` field (ARS, MCI, WOL, etc.) is unchanged and should be used for compact displays. Verify all frontend components handle longer team names gracefully.

### Problem 2: Rescheduled Matches Corrupt Deadlines

**What**: PL matches get moved between dates within a gameweek. Example: GW31 has 9 matches on Mar 20-22 but Wolves vs Arsenal was rescheduled to Feb 18. The automation picked Feb 18 as "earliest kickoff" and set the deadline to February — months in the past.

**Root cause**: `createDeadline()` used the absolute earliest kickoff across ALL matches in the round, including outliers moved weeks/months away from the main batch.

**Fix (done)**: Skip matches whose kickoff is already in the past when calculating deadlines. The deadline is based on the earliest FUTURE match in the round.

**Edge case to watch**: If ALL matches in a round are in the past (catching up on old gameweeks), the fallback is "7 days from now at 12:00 UTC".

### Problem 3: Postponed Matches Block Gameweek Completion

**What**: The automation waits for ALL matches in a round to have `strStatus === "Match Finished"` before marking winners and advancing. If a match is postponed indefinitely (FA Cup rescheduling, weather, stadium issues), the API may return status `"Postponed"`, `"Cancelled"`, or `"Abandoned"` — none of which are `"Match Finished"`. The automation would be stuck forever.

**Current behavior**: Stuck waiting. Logs show `"6/10 finished. Waiting."` indefinitely.

**Required fix**:
- [ ] In the completion check, treat these statuses as "resolved" (don't wait for them):
  - `"Postponed"` — match moved to another date/round
  - `"Cancelled"` — match won't be played
  - `"Abandoned"` — match stopped and won't resume
  - `"Awarded"` — result decided without full play
- [ ] Only wait for matches with status `"Not Started"`, `"Match Finished"`, or live statuses (`"1H"`, `"2H"`, `"HT"`, etc.)
- [ ] When a match is postponed, the two teams involved should NOT appear in `winning_teams` — users who picked those teams need admin intervention
- [ ] Log clearly when skipping postponed matches: `[AUTOMATION] Skipping postponed match: TeamA vs TeamB`

### Problem 4: Picks for Postponed Teams

**What**: If a user picked Arsenal and Arsenal's match gets postponed after the deadline, what happens? Arsenal won't appear in `winning_teams` (no result). The current elimination logic treats "team not in winners" as eliminated.

**Required fix**:
- [ ] Admin should be notified/alerted when a postponed match affects active picks
- [ ] Admin can manually decide: give affected users a reprieve (mark team as winner) or let elimination stand
- [ ] Consider adding a `"postponed"` status to picks so the frontend can show "Match postponed — awaiting admin decision" instead of incorrectly showing elimination

### Problem 5: Double Gameweeks

**What**: When a match is moved from GW31 to GW26, Arsenal plays twice in GW26. The API shows both matches under round 26.

**Current behavior (already works)**:
- `markWinners()` loops through ALL matches in the round — if Arsenal wins either game, Arsenal goes into `winning_teams`
- User who picked Arsenal survives if Arsenal wins at least one match
- The "can't pick same team twice" rule is across the whole season, not per-week — no conflict
- No schema or model changes needed

**No fix required** — document this as expected behavior.

### Problem 6: Frontend Team Name Updates

**What**: DB team names changed from short (`Man. City`, `Wolves`, `Nottingham`) to full API names (`Manchester City`, `Wolverhampton Wanderers`, `Nottingham Forest`). Frontend components that display team names need to handle the longer strings.

### Summary of Changes by File

| File | Change | Status |
|------|--------|--------|
| `pocketbase/pb_migrations/1756200000_seed_teams.js` | Seed 20 PL teams with full API names | Done |
| `pocketbase/pb_hooks/gameweek_automation.pb.js` | Fix empty filters, deadline calc, TEAM_NAME_MAP | Done |
| `pocketbase/pb_hooks/gameweek_automation.pb.js` | Handle postponed/cancelled match statuses | Phase 1 |
| `pocketbase/Dockerfile` | Docker build for PocketBase | Done |
| `frontend/Dockerfile` | Docker build for React frontend | Done |
| `docker-compose.yml` | Local dev orchestration | Done |
| `frontend/src/utils/teamMapping.js` | Align with new full team names in DB | Phase 2 |
| `frontend/src/components/*.jsx` | Verify long team name display | Phase 2 |

---

## Sequential Phases

Each phase must be completed and tested before moving to the next. Phases are ordered by dependency — later phases assume earlier ones are done.

---

### Phase 1: Postponement Handling in Automation Hook

**Goal**: The cron hook doesn't get stuck when matches are postponed, cancelled, or abandoned.

**Files**: `pocketbase/pb_hooks/gameweek_automation.pb.js`

- [x] Add `SKIP_STATUSES` list: `"Postponed"`, `"Cancelled"`, `"Abandoned"`, `"Awarded"`
- [x] Update completion check: a match counts as "resolved" if `strStatus === "Match Finished"` OR status is in `SKIP_STATUSES`
- [x] Log skipped matches: `[AUTOMATION] Skipping postponed: TeamA vs TeamB`
- [x] Postponed teams do NOT get added to `winning_teams` — no result means no winner
- [x] Also skip postponed matches in `getPollingWindow` so they don't corrupt the active window
- [x] Test in Docker: verify automation runs with postponement handling active

---

### Phase 2: Frontend Team Name Alignment

**Goal**: Frontend works correctly with the new full API team names in the DB.

**Files**: `frontend/src/utils/teamMapping.js`, all components displaying team names

- [x] Update `TEAM_NAME_MAP` in `teamMapping.js` to match new DB names
- [x] Update `getShortName()` to handle full API names → 3-letter codes
- [x] Verify `PickTeam.jsx` — team cards use `team_short_name`, confirm no overflow
- [x] Verify `MyPicks.jsx` — history cards handle full names
- [x] Verify `AllPlayersPicksHistory.jsx` — table/grid handles full names
- [x] Verify `Admin.jsx` — winner marking dropdown shows full names correctly
- [x] Remove any hardcoded short team name references
- [x] Test in Docker: full flow from pick to elimination with new names

---

### Phase 3: Frontend Postponement Filtering

**Goal**: Filter out postponed matches from fixture displays and flag affected picks. TheSportsDB correctly reports `strStatus: "Match Postponed"` but the frontend doesn't use it — postponed matches still show as upcoming fixtures with stale dates.

**Files**: `frontend/src/components/PickTeam.jsx`, `frontend/src/components/admin/WinnersMarking.jsx`

- [x] Filter postponed/moved matches out of fixture list, show in separate "MOVED" cards below
- [x] Filter postponed matches in `WinnersMarking.jsx` match results display
- [x] Skip postponed matches in deadline calculation (`calculateDeadlineFromMatches`)
- [x] Show warning when user's selected team has a moved match
- [x] Remove teams with moved matches from pick grid (uses `strPostponed` field + date-based detection for early-played matches)
- [x] Test in Docker: verify GW31 shows 8 upcoming matches + 2 moved (WOL vs ARS, MCI vs CRY)

---

### Phase 4: Admin Tools for Edge Cases

**Goal**: Admin can intervene when postponements or rescheduling affect active picks.

**Files**: `frontend/src/components/Admin.jsx` (or new sub-component)

- [ ] Show alert in admin panel when a postponed match has active user picks
- [ ] Admin can manually mark a team as winner for a week (override — already partially works)
- [ ] Admin can see which users are affected by a postponement
- [ ] Consider `"postponed"` status on picks → frontend shows "Awaiting admin decision" instead of false elimination

---

### Phase 5: Reliability & Bug Fixes

**Goal**: Fix known bugs that would bite in production.

- [ ] **Dynamic season detection** — hardcoded `2025-2026` in `api.js` and hook. Derive from current date or config.
- [ ] **Timezone handling** — deadline times parsed without explicit timezone. Standardize on UTC.
- [ ] **Race condition on pick submit** — disable button during request to prevent double-submit.
- [ ] **Stale team references** — picks referencing deleted team IDs show "Team ID:" fallback. Handle gracefully.
- [ ] **API timeout** — frontend TheSportsDB calls have no timeout; can hang.
- [ ] **Add `.env.example`** — document required env vars for new developers.

---

### Phase 6: Testing

**Goal**: Confidence that changes don't break things.

- [ ] **Component tests** — PickTeam, Admin tabs, AllPlayersPicksHistory, Login
- [ ] **Integration tests** — full pick submission flow with mocked PocketBase
- [ ] **E2E tests with Playwright** — login, pick submission, admin winner marking
- [ ] **Test getShortName helper** — edge cases with new full team names

---

### Phase 7: UX Polish

**Goal**: Better user experience.

- [ ] Loading skeletons instead of "Loading..." text
- [ ] Team logos/badges on pick cards and match cards
- [ ] Active nav link highlight
- [ ] Toast notifications instead of inline messages
- [ ] Confirmation dialogs instead of `window.confirm()`
- [ ] Dark mode toggle
- [ ] Leaderboard — rankings of surviving players

---

### Phase 8: Code Quality

**Goal**: Maintainability for future changes.

- [ ] `useReducer` in Admin to replace 12+ useState calls
- [ ] `useMemo` for expensive calculations (isTeamDisabled, player sorting)
- [ ] Extract deadline logic into custom hook
- [ ] Consistent error handling pattern (useAsyncAction hook)
- [ ] TypeScript migration (long-term)

---

## Completed

- [x] Deduplicate getMatchWinner, getFirstAvailableTeam, checkUserElimination
- [x] Split Admin.jsx (1034 lines) into UserManagement, WinnersMarking, GameReset
- [x] Add ErrorBoundary component
- [x] Extract utils/api.js and utils/teamMapping.js
- [x] CSS custom properties and consistent color palette (PL branding)
- [x] Replace all inline styles with CSS classes
- [x] Scoreboard-style match cards with 3-letter abbreviations
- [x] Bold winner team in scoreboard (no separate winner row)
- [x] Team pick cards show only 3-letter codes
- [x] Mobile responsive breakpoints (768px, 480px)
- [x] Keyboard accessibility on team cards
- [x] Focus-visible outlines
- [x] Card entrance animations
- [x] Fix teams DB (removed 60 duplicates, correct 20 PL 2025/26 teams)
- [x] Gameweek automation cron hook (fetch results, mark winners, create deadlines, auto-assign picks)
- [x] Docker setup (PocketBase + frontend containers, docker-compose.yml)
- [x] Team name alignment — DB uses full API names via seed migration
- [x] Deadline calculation — skip rescheduled past matches
- [x] Idempotent DB operations — duplicate deadline/pick/winner prevention
- [x] Empty filter fix — PocketBase `findRecordsByFilter` requires non-empty filter
- [x] PocketBase JSVM scope fix — all code inlined inside cronAdd callback
