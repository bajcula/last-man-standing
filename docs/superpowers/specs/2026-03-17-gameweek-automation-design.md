# Gameweek Automation — Design Spec

## Problem

The Last Man Standing app requires manual admin intervention every week to:
1. Fetch match results from TheSportsDB API
2. Mark winning teams
3. Create deadlines for the next week
4. Auto-assign picks for users who haven't picked

This means the game stalls whenever the admin doesn't log in. The app has been stuck on GW3 while the real PL season is at GW30.

## Solution

A PocketBase cron hook (`pb_hooks/gameweek_automation.js`) that automatically processes gameweeks. The app will be self-hosted (not PocketHost) to enable hooks.

## Fresh Start

The game resets at GW30 (current real PL gameweek). No historical catch-up. All existing picks, winners, and deadlines are cleared. The automation takes over from there.

## Cron Schedule

A single cron runs every 30 minutes:

```
*/30 * * * *
```

The logic inside determines whether to do work based on the match schedule (smart polling).

## Core Logic: `processGameweek()`

### Step 1: Determine Current App Week

Read the latest `deadlines` record (highest `week_number`). This is the week the app is currently on. If no deadlines exist, use a configured `START_WEEK` (default: 30).

### Step 2: Fetch Match Schedule

Call TheSportsDB API for the current week's matches:
```
GET https://www.thesportsdb.com/api/v1/json/3/eventsround.php?id=4328&r={week}&s=2025-2026
```

### Step 3: Smart Polling Window

From the match schedule, determine:
- `firstKickoff`: earliest `dateEvent + strTime` in the week
- `lastKickoff`: latest `dateEvent + strTime` in the week

**Active window**: from `firstKickoff` until `lastKickoff + 5 hours`
**Sleep window**: from `lastKickoff + 5 hours` until `nextWeekFirstKickoff - 2 hours`

If current time is in the sleep window → exit immediately, no API calls wasted.

If current time is before `firstKickoff` → also exit (matches haven't started).

### Step 4: Check Results

If in the active window, check if ALL matches have `strStatus === "Match Finished"`.

- **Not all finished** → exit, wait for next cron tick (30 min)
- **All finished** → proceed to Step 5

### Step 5: Mark Winners

For each finished match:
1. Call `getMatchWinner()` to determine winner from scores
2. Map API team name to database team using `TEAM_NAME_MAP`
3. Check if `winning_teams` record already exists for this week + team (idempotent)
4. If not, create `winning_teams` record

Draws produce no winner record — both teams' pickers are eliminated.

### Step 6: Create Next Week Deadline

1. Fetch next week's matches from API: `r={currentWeek + 1}`
2. Find `firstKickoff` of next week
3. Set deadline to `firstKickoff - 2 hours`
4. Create `deadlines` record: `{ week_number: currentWeek + 1, deadline_time: deadline, is_closed: false }`

### Step 7: Auto-Assign Picks for Next Week

For each active (non-eliminated) user:
1. Get their existing picks (all weeks)
2. Find first team alphabetically that they haven't used
3. Create `picks` record: `{ user_id, team_id, week_number: currentWeek + 1 }`

Users can still change their pick before the deadline.

## Idempotency

Every operation checks for existing records before creating. Running the same cron tick twice for the same gameweek produces no duplicates:
- `winning_teams`: check `week_number + team_id` pair exists
- `deadlines`: check `week_number` exists
- `picks`: check `user_id + week_number` pair exists

## Elimination

Elimination is already handled client-side by `checkUserElimination()` in `gameLogic.js`. Once `winning_teams` records exist for a week, users with non-winning picks are shown as eliminated on next page load. No backend change needed.

## File Structure

```
pocketbase/
  pb_hooks/
    gameweek_automation.js    # Cron hook — all automation logic
```

The hook uses PocketBase's built-in `cronAdd()` API and `$http.send()` for API calls. No external dependencies.

## Configuration

Constants at the top of the hook file:
```javascript
const LEAGUE_ID = '4328';           // Premier League
const SEASON = '2025-2026';
const START_WEEK = 30;              // First automated gameweek
const DEADLINE_BUFFER_HOURS = 2;    // Deadline = first kickoff - 2h
const RESULTS_BUFFER_HOURS = 5;     // Stop polling 5h after last kickoff
const API_BASE = 'https://www.thesportsdb.com/api/v1/json/3';
```

## Team Name Mapping

The same `TEAM_NAME_MAP` from `frontend/src/utils/teamMapping.js` is duplicated in the hook file (PocketBase hooks can't import from the frontend). This maps TheSportsDB team names to database `team_name` values.

## Error Handling

- API failures: log error, exit. Next cron tick retries.
- Partial match data: if API returns incomplete data, skip processing. All-or-nothing.
- Database write failures: log error. Idempotency ensures next tick retries the missing records.

## Logging

Use `console.log()` (visible in PocketBase server logs):
- `[AUTOMATION] Cron tick — current week: {n}, window: active|sleep`
- `[AUTOMATION] All matches finished for week {n}. Processing results.`
- `[AUTOMATION] Marked {n} winners for week {w}`
- `[AUTOMATION] Created deadline for week {w}: {datetime}`
- `[AUTOMATION] Auto-assigned picks for {n} users`
- `[AUTOMATION] Skipping — outside active window`

## What Changes on the Frontend

Nothing breaks. The frontend already reads `deadlines`, `winning_teams`, and `picks` from PocketBase. The automation just creates these records automatically instead of the admin doing it manually.

The admin panel still works — the admin can still manually override winners or deadlines if needed.

## Migration Path

1. Self-host PocketBase (replace PocketHost)
2. Reset game: clear picks, winners, deadlines
3. Drop `gameweek_automation.js` into `pb_hooks/`
4. Set `START_WEEK = 30`
5. Start PocketBase — automation begins on next cron tick
