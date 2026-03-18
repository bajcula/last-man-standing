# Gameweek Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate the weekly Last Man Standing game cycle — fetching results, marking winners, creating deadlines, and auto-assigning picks — via a PocketBase cron hook.

**Architecture:** A single PocketBase JS hook file (`pb_hooks/gameweek_automation.pb.js`) registers a cron that runs every 30 minutes. It uses smart polling windows based on the real PL match schedule to avoid wasted API calls. All database operations are idempotent.

**Tech Stack:** PocketBase JSVM (cronAdd, $http.send, $app.dao()), TheSportsDB API

---

### Task 0: Docker setup for local development and testing

**Files:**
- Create: `pocketbase/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `docker-compose.yml` (project root)

- [ ] **Step 0.1: Create PocketBase Dockerfile**

```dockerfile
FROM alpine:3.19
ARG PB_VERSION=0.22.22
RUN apk add --no-cache ca-certificates unzip wget
RUN wget -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
    && unzip /tmp/pb.zip -d /pb/ \
    && rm /tmp/pb.zip
WORKDIR /pb
COPY pb_hooks/ /pb/pb_hooks/
COPY pb_data/ /pb/pb_data/
EXPOSE 8090
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
```

- [ ] **Step 0.2: Create frontend Dockerfile**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_POCKETBASE_URL=http://localhost:8090
ENV VITE_POCKETBASE_URL=$VITE_POCKETBASE_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 0.3: Create nginx.conf for frontend SPA routing**

Create `frontend/nginx.conf`:
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 0.4: Create docker-compose.yml at project root**

```yaml
services:
  pocketbase:
    build: ./pocketbase
    ports:
      - "8090:8090"
    volumes:
      - pb_data:/pb/pb_data
      - ./pocketbase/pb_hooks:/pb/pb_hooks
  frontend:
    build:
      context: ./frontend
      args:
        VITE_POCKETBASE_URL: http://localhost:8090
    ports:
      - "3000:80"
    depends_on:
      - pocketbase
volumes:
  pb_data:
```

- [ ] **Step 0.5: Test with `docker compose up --build`**

```bash
cd /Users/banek1/Projects/last-man-standing
docker compose up --build
```

Verify:
- PocketBase accessible at `http://localhost:8090/_/`
- Frontend accessible at `http://localhost:3000`
- Cron hook fires and logs appear in `docker compose logs pocketbase`

- [ ] **Step 0.6: Commit**

```bash
git add pocketbase/Dockerfile frontend/Dockerfile frontend/nginx.conf docker-compose.yml
git commit -m "feat: add Docker setup for local development and testing"
```

---

### Task 1: Create the hook file with cron registration and config

**Files:**
- Create: `pocketbase/pb_hooks/gameweek_automation.pb.js`

- [ ] **Step 1: Create the hook file with constants and cron skeleton**

```javascript
/// <reference path="../pb_data/types.d.ts" />

// ============================================================
// Gameweek Automation — PocketBase Cron Hook
// Automatically processes PL gameweeks for Last Man Standing
// ============================================================

const LEAGUE_ID = '4328';
const SEASON = '2025-2026';
const START_WEEK = 30;
const DEADLINE_BUFFER_HOURS = 2;
const RESULTS_BUFFER_HOURS = 5;
const API_BASE = 'https://www.thesportsdb.com/api/v1/json/3';

// Team name mapping (duplicated from frontend — PB hooks can't import frontend code)
const TEAM_NAME_MAP = {
  'Manchester United': 'Manchester United',
  'Manchester City': 'Manchester City',
  'Man United': 'Manchester United',
  'Man City': 'Manchester City',
  'Newcastle': 'Newcastle United',
  'Newcastle United': 'Newcastle United',
  'West Ham': 'West Ham United',
  'West Ham United': 'West Ham United',
  'Tottenham': 'Tottenham Hotspur',
  'Tottenham Hotspur': 'Tottenham Hotspur',
  'Leicester': 'Leicester City',
  'Leicester City': 'Leicester City',
  'Wolves': 'Wolverhampton Wanderers',
  'Wolverhampton': 'Wolverhampton Wanderers',
  'Nottm Forest': 'Nottingham Forest',
  'Nottingham Forest': 'Nottingham Forest',
  'Brighton': 'Brighton',
  'Crystal Palace': 'Crystal Palace',
};

cronAdd('gameweek_automation', '*/30 * * * *', () => {
  try {
    processGameweek();
  } catch (err) {
    console.log('[AUTOMATION] Error:', err);
  }
});

function processGameweek() {
  console.log('[AUTOMATION] Cron tick');
  // Will be filled in next tasks
}
```

- [ ] **Step 2: Verify the file is recognized by PocketBase**

Restart PocketBase and check logs:
```bash
cd /Users/banek1/Projects/last-man-standing/pocketbase && ./pocketbase serve
```
Expected: No errors about the hook file. Log should show `[AUTOMATION] Cron tick` within 30 minutes (or test by temporarily setting cron to `* * * * *` for every minute, then revert).

- [ ] **Step 3: Commit**

```bash
git add pocketbase/pb_hooks/gameweek_automation.pb.js
git commit -m "feat: add gameweek automation cron hook skeleton"
```

---

### Task 2: Add helper functions — API fetch, team lookup, match winner

**Files:**
- Modify: `pocketbase/pb_hooks/gameweek_automation.pb.js`

- [ ] **Step 1: Add the fetchRoundMatches helper**

Add above `processGameweek()`:

```javascript
// ---- API Helpers ----

function fetchRoundMatches(round) {
  const url = `${API_BASE}/eventsround.php?id=${LEAGUE_ID}&r=${round}&s=${SEASON}`;
  const res = $http.send({ url: url, method: 'GET', timeout: 30 });
  if (res.statusCode !== 200) {
    throw new Error(`API returned ${res.statusCode} for round ${round}`);
  }
  return res.json.events || [];
}
```

- [ ] **Step 2: Add getMatchWinner helper**

```javascript
function getMatchWinner(match) {
  if (match.strStatus !== 'Match Finished') return null;
  const home = parseInt(match.intHomeScore) || 0;
  const away = parseInt(match.intAwayScore) || 0;
  if (home > away) return match.strHomeTeam;
  if (away > home) return match.strAwayTeam;
  return 'Draw';
}
```

- [ ] **Step 3: Add findTeamByApiName helper**

```javascript
function findTeamByApiName(apiName, teams) {
  // Try mapped name
  const mapped = TEAM_NAME_MAP[apiName];
  if (mapped) {
    const team = teams.find(t => t.getString('team_name') === mapped);
    if (team) return team;
  }
  // Try exact match
  const exact = teams.find(t => t.getString('team_name') === apiName);
  if (exact) return exact;
  // Try partial
  return teams.find(t =>
    t.getString('team_name').includes(apiName) ||
    apiName.includes(t.getString('team_name').split(' ')[0])
  ) || null;
}
```

- [ ] **Step 4: Add getCurrentWeek helper**

```javascript
function getCurrentWeek() {
  try {
    const deadlines = $app.dao().findRecordsByFilter(
      'deadlines', '', '-week_number', 1, 0
    );
    if (deadlines.length > 0) {
      return deadlines[0].getInt('week_number');
    }
  } catch (e) {
    // No deadlines yet
  }
  return START_WEEK;
}
```

- [ ] **Step 5: Commit**

```bash
git add pocketbase/pb_hooks/gameweek_automation.pb.js
git commit -m "feat: add automation helper functions (API, team lookup, match winner)"
```

---

### Task 3: Implement smart polling window logic

**Files:**
- Modify: `pocketbase/pb_hooks/gameweek_automation.pb.js`

- [ ] **Step 1: Add getPollingWindow helper**

Add above `processGameweek()`:

```javascript
function getPollingWindow(matches) {
  if (!matches || matches.length === 0) return { active: false, reason: 'no matches' };

  let earliest = null;
  let latest = null;

  for (const match of matches) {
    const kickoff = new Date(match.dateEvent + 'T' + (match.strTime || '00:00:00'));
    if (!earliest || kickoff < earliest) earliest = kickoff;
    if (!latest || kickoff > latest) latest = kickoff;
  }

  const now = new Date();
  const activeStart = earliest;
  const activeEnd = new Date(latest.getTime() + RESULTS_BUFFER_HOURS * 60 * 60 * 1000);

  if (now < activeStart) {
    return { active: false, reason: 'before first kickoff', firstKickoff: earliest };
  }
  if (now > activeEnd) {
    return { active: false, reason: 'past results window', lastKickoff: latest };
  }

  return { active: true, firstKickoff: earliest, lastKickoff: latest };
}
```

- [ ] **Step 2: Add weekAlreadyProcessed check helper**

```javascript
function weekAlreadyProcessed(weekNumber) {
  try {
    const winners = $app.dao().findRecordsByFilter(
      'winning_teams',
      `week_number = ${weekNumber}`,
      '', 1, 0
    );
    return winners.length > 0;
  } catch (e) {
    return false;
  }
}
```

- [ ] **Step 3: Wire up processGameweek with polling window**

Replace the `processGameweek()` function body:

```javascript
function processGameweek() {
  const currentWeek = getCurrentWeek();
  console.log(`[AUTOMATION] Cron tick — current week: ${currentWeek}`);

  // Skip if this week already has winners marked
  if (weekAlreadyProcessed(currentWeek)) {
    console.log(`[AUTOMATION] Week ${currentWeek} already processed. Checking if next week deadline exists.`);
    ensureNextWeekReady(currentWeek);
    return;
  }

  // Fetch matches for current week
  let matches;
  try {
    matches = fetchRoundMatches(currentWeek);
  } catch (err) {
    console.log(`[AUTOMATION] Failed to fetch matches for week ${currentWeek}: ${err}`);
    return;
  }

  if (!matches || matches.length === 0) {
    console.log(`[AUTOMATION] No matches found for week ${currentWeek}`);
    return;
  }

  // Check polling window
  const window = getPollingWindow(matches);
  if (!window.active) {
    console.log(`[AUTOMATION] Skipping — ${window.reason}`);
    return;
  }

  // Check if all matches are finished
  const allFinished = matches.every(m => m.strStatus === 'Match Finished');
  if (!allFinished) {
    const finished = matches.filter(m => m.strStatus === 'Match Finished').length;
    console.log(`[AUTOMATION] ${finished}/${matches.length} matches finished. Waiting.`);
    return;
  }

  // All matches done — process results
  console.log(`[AUTOMATION] All ${matches.length} matches finished for week ${currentWeek}. Processing.`);
  markWinners(currentWeek, matches);
  ensureNextWeekReady(currentWeek);
}
```

- [ ] **Step 4: Commit**

```bash
git add pocketbase/pb_hooks/gameweek_automation.pb.js
git commit -m "feat: add smart polling window and processGameweek orchestrator"
```

---

### Task 4: Implement markWinners

**Files:**
- Modify: `pocketbase/pb_hooks/gameweek_automation.pb.js`

- [ ] **Step 1: Add markWinners function**

```javascript
function markWinners(weekNumber, matches) {
  const teams = $app.dao().findRecordsByFilter('teams', '', '', 0, 0);
  const collection = $app.dao().findCollectionByNameOrId('winning_teams');
  let count = 0;

  for (const match of matches) {
    const winnerName = getMatchWinner(match);
    if (!winnerName || winnerName === 'Draw') continue;

    const dbTeam = findTeamByApiName(winnerName, teams);
    if (!dbTeam) {
      console.log(`[AUTOMATION] WARNING: Could not find team "${winnerName}" in DB`);
      continue;
    }

    // Idempotent: check if already exists
    try {
      const existing = $app.dao().findRecordsByFilter(
        'winning_teams',
        `week_number = ${weekNumber} && team_id = "${dbTeam.getId()}"`,
        '', 1, 0
      );
      if (existing.length > 0) continue;
    } catch (e) {
      // No existing record, proceed
    }

    const record = new Record(collection);
    record.set('week_number', weekNumber);
    record.set('team_id', dbTeam.getId());
    $app.dao().saveRecord(record);
    count++;
  }

  console.log(`[AUTOMATION] Marked ${count} winners for week ${weekNumber}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add pocketbase/pb_hooks/gameweek_automation.pb.js
git commit -m "feat: add markWinners — idempotent winner recording"
```

---

### Task 5: Implement ensureNextWeekReady (deadline + auto-assign)

**Files:**
- Modify: `pocketbase/pb_hooks/gameweek_automation.pb.js`

- [ ] **Step 1: Add ensureNextWeekReady function**

```javascript
function ensureNextWeekReady(currentWeek) {
  const nextWeek = currentWeek + 1;

  // Check if deadline already exists for next week
  let deadlineExists = false;
  try {
    const existing = $app.dao().findRecordsByFilter(
      'deadlines',
      `week_number = ${nextWeek}`,
      '', 1, 0
    );
    deadlineExists = existing.length > 0;
  } catch (e) {
    // No deadline yet
  }

  if (!deadlineExists) {
    createNextWeekDeadline(nextWeek);
  }

  // Auto-assign picks for next week
  autoAssignPicks(nextWeek);
}
```

- [ ] **Step 2: Add createNextWeekDeadline function**

```javascript
function createNextWeekDeadline(weekNumber) {
  let deadlineTime;

  try {
    const nextMatches = fetchRoundMatches(weekNumber);
    if (nextMatches && nextMatches.length > 0) {
      // Find earliest kickoff
      let earliest = null;
      for (const match of nextMatches) {
        const kickoff = new Date(match.dateEvent + 'T' + (match.strTime || '00:00:00'));
        if (!earliest || kickoff < earliest) earliest = kickoff;
      }
      // Deadline = first kickoff minus buffer
      deadlineTime = new Date(earliest.getTime() - DEADLINE_BUFFER_HOURS * 60 * 60 * 1000);
    }
  } catch (err) {
    console.log(`[AUTOMATION] Could not fetch week ${weekNumber} matches for deadline: ${err}`);
  }

  // Fallback: 7 days from now at 12:00 UTC
  if (!deadlineTime) {
    deadlineTime = new Date();
    deadlineTime.setDate(deadlineTime.getDate() + 7);
    deadlineTime.setHours(12, 0, 0, 0);
  }

  const collection = $app.dao().findCollectionByNameOrId('deadlines');
  const record = new Record(collection);
  record.set('week_number', weekNumber);
  record.set('deadline_time', deadlineTime.toISOString());
  record.set('is_closed', false);
  $app.dao().saveRecord(record);

  console.log(`[AUTOMATION] Created deadline for week ${weekNumber}: ${deadlineTime.toISOString()}`);
}
```

- [ ] **Step 3: Add autoAssignPicks function**

```javascript
function autoAssignPicks(weekNumber) {
  const allTeams = $app.dao().findRecordsByFilter('teams', '', 'team_name', 0, 0);
  const allUsers = $app.dao().findRecordsByFilter('users', '', '', 0, 0);
  const allWinners = $app.dao().findRecordsByFilter('winning_teams', '', '', 0, 0);
  const picksCollection = $app.dao().findCollectionByNameOrId('picks');

  let count = 0;

  for (const user of allUsers) {
    const userId = user.getId();

    // Check if user already has a pick for this week
    try {
      const existingPick = $app.dao().findRecordsByFilter(
        'picks',
        `user_id = "${userId}" && week_number = ${weekNumber}`,
        '', 1, 0
      );
      if (existingPick.length > 0) continue;
    } catch (e) {
      // No existing pick, proceed
    }

    // Check if user is eliminated (skip eliminated users)
    const userPicks = $app.dao().findRecordsByFilter(
      'picks',
      `user_id = "${userId}"`,
      '', 0, 0
    );

    if (isUserEliminated(userPicks, allWinners, weekNumber)) continue;

    // Find first available team alphabetically
    const usedTeamIds = userPicks.map(p => p.getString('team_id'));
    const sortedTeams = [...allTeams].sort((a, b) =>
      a.getString('team_name').localeCompare(b.getString('team_name'))
    );
    const availableTeam = sortedTeams.find(t => !usedTeamIds.includes(t.getId()));

    if (!availableTeam) {
      console.log(`[AUTOMATION] No available teams for user ${userId}`);
      continue;
    }

    const pick = new Record(picksCollection);
    pick.set('user_id', userId);
    pick.set('team_id', availableTeam.getId());
    pick.set('week_number', weekNumber);
    $app.dao().saveRecord(pick);
    count++;
  }

  console.log(`[AUTOMATION] Auto-assigned picks for ${count} users for week ${weekNumber}`);
}
```

- [ ] **Step 4: Add isUserEliminated helper**

```javascript
function isUserEliminated(userPicks, allWinners, currentWeek) {
  if (currentWeek <= 1) return false;

  for (let week = 1; week < currentWeek; week++) {
    const weekWinners = allWinners.filter(w => w.getInt('week_number') === week);
    if (weekWinners.length === 0) continue; // Skip unplayed weeks

    const pickForWeek = userPicks.find(p => p.getInt('week_number') === week);
    if (!pickForWeek) return true; // No pick = eliminated

    const pickTeamId = pickForWeek.getString('team_id');
    const teamWon = weekWinners.some(w => w.getString('team_id') === pickTeamId);
    if (!teamWon) return true; // Team lost = eliminated
  }

  return false;
}
```

- [ ] **Step 5: Commit**

```bash
git add pocketbase/pb_hooks/gameweek_automation.pb.js
git commit -m "feat: add ensureNextWeekReady — deadline creation and auto-assign picks"
```

---

### Task 6: Add initial setup for fresh start at GW30

**Files:**
- Modify: `pocketbase/pb_hooks/gameweek_automation.pb.js`

- [ ] **Step 1: Add one-time setup function**

This runs on first cron tick if no deadlines exist. It creates the initial deadline for the starting week so the game begins.

Add above `processGameweek()`:

```javascript
function ensureInitialSetup() {
  // Check if any deadlines exist
  try {
    const deadlines = $app.dao().findRecordsByFilter('deadlines', '', '', 1, 0);
    if (deadlines.length > 0) return; // Already initialized
  } catch (e) {
    // No deadlines — needs setup
  }

  console.log(`[AUTOMATION] First run — initializing game at week ${START_WEEK}`);

  // Create deadline for the starting week
  createNextWeekDeadline(START_WEEK);

  // Auto-assign picks for all users
  autoAssignPicks(START_WEEK);

  console.log(`[AUTOMATION] Initial setup complete for week ${START_WEEK}`);
}
```

- [ ] **Step 2: Call ensureInitialSetup at the top of processGameweek**

Update `processGameweek()` — add as the first line inside the function:

```javascript
function processGameweek() {
  ensureInitialSetup();

  const currentWeek = getCurrentWeek();
  // ... rest of function unchanged
```

- [ ] **Step 3: Commit**

```bash
git add pocketbase/pb_hooks/gameweek_automation.pb.js
git commit -m "feat: add initial setup for fresh start at configurable START_WEEK"
```

---

### Task 7: End-to-end test with local PocketBase

**Files:**
- No new files — manual testing

- [ ] **Step 1: Clear existing game data**

Reset the database for a fresh start. Via PocketBase admin UI (`http://localhost:8090/_/`):
1. Delete all records from `picks`
2. Delete all records from `winning_teams`
3. Delete all records from `deadlines`

- [ ] **Step 2: Start PocketBase with the hook**

```bash
cd /Users/banek1/Projects/last-man-standing/pocketbase && ./pocketbase serve
```

Check logs for:
- `[AUTOMATION] First run — initializing game at week 30`
- `[AUTOMATION] Created deadline for week 30: ...`
- `[AUTOMATION] Auto-assigned picks for N users for week 30`

- [ ] **Step 3: Verify database state**

In PocketBase admin UI, confirm:
- `deadlines` has 1 record for week 30 with a valid deadline_time
- `picks` has 1 record per user for week 30
- No `winning_teams` records yet

- [ ] **Step 4: Verify subsequent cron ticks**

Wait for next cron tick (or temporarily set to every minute). Check logs for:
- If matches haven't started: `[AUTOMATION] Skipping — before first kickoff`
- If in active window but not all done: `[AUTOMATION] X/10 matches finished. Waiting.`
- If past results window and processed: `[AUTOMATION] Week 30 already processed`

- [ ] **Step 5: Verify frontend still works**

Open `http://localhost:5173/pick` — should show week 30 with the auto-assigned team and the correct deadline. The pick page should function exactly as before.

- [ ] **Step 6: Commit final state**

```bash
git add pocketbase/pb_hooks/gameweek_automation.pb.js
git commit -m "feat: gameweek automation — complete and tested"
```
