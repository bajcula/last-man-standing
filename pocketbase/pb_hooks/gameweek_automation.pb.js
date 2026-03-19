cronAdd("gw_auto", "* * * * *", function() {
  var LEAGUE_ID = "4328";
  var START_WEEK = 30;

  // Derive season from current date: Aug onward = new season
  var now = new Date();
  var startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  var SEASON = startYear + "-" + (startYear + 1);
  var DEADLINE_BUFFER_HOURS = 2;
  var RESULTS_BUFFER_HOURS = 5;
  var API_BASE = "https://www.thesportsdb.com/api/v1/json/3";

  var SKIP_STATUSES = ["Postponed", "Cancelled", "Abandoned", "Awarded"];

  function isSkippedStatus(status) {
    return SKIP_STATUSES.indexOf(status) !== -1;
  }

  var TEAM_NAME_MAP = {
    "Man United": "Manchester United",
    "Man City": "Manchester City",
    "Newcastle": "Newcastle United",
    "West Ham": "West Ham United",
    "Tottenham": "Tottenham Hotspur",
    "Spurs": "Tottenham Hotspur",
    "Leicester": "Leicester City",
    "Wolves": "Wolverhampton Wanderers",
    "Wolverhampton": "Wolverhampton Wanderers",
    "Nottm Forest": "Nottingham Forest",
    "Brighton": "Brighton and Hove Albion",
    "Nott'm Forest": "Nottingham Forest"
  };

  function fetchRoundMatches(round) {
    var url = API_BASE + "/eventsround.php?id=" + LEAGUE_ID + "&r=" + round + "&s=" + SEASON;
    var res = $http.send({ url: url, method: "GET", timeout: 30 });
    if (res.statusCode !== 200) throw new Error("API returned " + res.statusCode);
    return res.json.events || [];
  }

  function getMatchWinner(match) {
    if (match.strStatus !== "Match Finished") return null;
    var home = parseInt(match.intHomeScore) || 0;
    var away = parseInt(match.intAwayScore) || 0;
    if (home > away) return match.strHomeTeam;
    if (away > home) return match.strAwayTeam;
    return "Draw";
  }

  function findTeamByApiName(apiName, teams) {
    var mapped = TEAM_NAME_MAP[apiName];
    for (var i = 0; i < teams.length; i++) {
      if (mapped && teams[i].getString("team_name") === mapped) return teams[i];
    }
    for (var j = 0; j < teams.length; j++) {
      if (teams[j].getString("team_name") === apiName) return teams[j];
    }
    for (var k = 0; k < teams.length; k++) {
      var tn = teams[k].getString("team_name");
      if (tn.indexOf(apiName) !== -1 || apiName.indexOf(tn.split(" ")[0]) !== -1) return teams[k];
    }
    return null;
  }

  function getCurrentWeek() {
    try {
      var deadlines = $app.dao().findRecordsByFilter("deadlines", "id != ''", "-week_number", 1, 0);
      if (deadlines.length > 0) return deadlines[0].getInt("week_number");
    } catch (e) {}
    return START_WEEK;
  }

  function weekAlreadyProcessed(wn) {
    try {
      var w = $app.dao().findRecordsByFilter("winning_teams", "week_number = " + wn, "", 1, 0);
      return w.length > 0;
    } catch (e) { return false; }
  }

  function getPollingWindow(matches) {
    if (!matches || matches.length === 0) return { active: false, reason: "no matches" };
    var earliest = null;
    var latest = null;
    for (var i = 0; i < matches.length; i++) {
      if (isSkippedStatus(matches[i].strStatus)) continue;
      var ko = new Date(matches[i].dateEvent + "T" + (matches[i].strTime || "00:00:00"));
      if (!earliest || ko < earliest) earliest = ko;
      if (!latest || ko > latest) latest = ko;
    }
    if (!earliest || !latest) return { active: false, reason: "all matches postponed/cancelled" };
    var now = new Date();
    var activeEnd = new Date(latest.getTime() + RESULTS_BUFFER_HOURS * 60 * 60 * 1000);
    if (now < earliest) return { active: false, reason: "before first kickoff" };
    if (now > activeEnd) return { active: false, reason: "past results window" };
    return { active: true };
  }

  function markWinners(weekNumber, matches) {
    var teams = $app.dao().findRecordsByFilter("teams", "id != ''", "", 0, 0);
    var col = $app.dao().findCollectionByNameOrId("winning_teams");
    var count = 0;
    for (var i = 0; i < matches.length; i++) {
      var wn = getMatchWinner(matches[i]);
      if (!wn || wn === "Draw") continue;
      var dbTeam = findTeamByApiName(wn, teams);
      if (!dbTeam) { console.log("[AUTOMATION] WARNING: team not found: " + wn); continue; }
      try {
        var ex = $app.dao().findRecordsByFilter("winning_teams", "week_number = " + weekNumber + " && team_id = '" + dbTeam.getId() + "'", "", 1, 0);
        if (ex.length > 0) continue;
      } catch (e) {}
      var rec = new Record(col);
      rec.set("week_number", weekNumber);
      rec.set("team_id", dbTeam.getId());
      $app.dao().saveRecord(rec);
      count++;
    }
    console.log("[AUTOMATION] Marked " + count + " winners for week " + weekNumber);
  }

  function isUserEliminated(userPicks, allWinners, currentWeek) {
    if (currentWeek <= 1) return false;
    for (var week = 1; week < currentWeek; week++) {
      var ww = [];
      for (var i = 0; i < allWinners.length; i++) {
        if (allWinners[i].getInt("week_number") === week) ww.push(allWinners[i]);
      }
      if (ww.length === 0) continue;
      var pick = null;
      for (var j = 0; j < userPicks.length; j++) {
        if (userPicks[j].getInt("week_number") === week) { pick = userPicks[j]; break; }
      }
      if (!pick) return true;
      var tid = pick.getString("team_id");
      var won = false;
      for (var k = 0; k < ww.length; k++) {
        if (ww[k].getString("team_id") === tid) { won = true; break; }
      }
      if (!won) return true;
    }
    return false;
  }

  function createDeadline(weekNumber) {
    try {
      var existing = $app.dao().findRecordsByFilter("deadlines", "week_number = " + weekNumber, "", 1, 0);
      if (existing.length > 0) {
        console.log("[AUTOMATION] Deadline for week " + weekNumber + " already exists, skipping.");
        return;
      }
    } catch (e) {}
    var deadlineTime = null;
    try {
      var m = fetchRoundMatches(weekNumber);
      if (m && m.length > 0) {
        var now = new Date();
        var earliest = null;
        for (var i = 0; i < m.length; i++) {
          var ko = new Date(m[i].dateEvent + "T" + (m[i].strTime || "00:00:00"));
          if (ko < now) continue;
          if (!earliest || ko < earliest) earliest = ko;
        }
        if (earliest) {
          deadlineTime = new Date(earliest.getTime() - DEADLINE_BUFFER_HOURS * 60 * 60 * 1000);
        }
      }
    } catch (err) {
      console.log("[AUTOMATION] Could not fetch week " + weekNumber + " for deadline: " + err);
    }
    if (!deadlineTime) {
      deadlineTime = new Date();
      deadlineTime.setDate(deadlineTime.getDate() + 7);
      deadlineTime.setHours(12, 0, 0, 0);
    }
    var col = $app.dao().findCollectionByNameOrId("deadlines");
    var rec = new Record(col);
    rec.set("week_number", weekNumber);
    rec.set("deadline_time", deadlineTime.toISOString());
    rec.set("is_closed", false);
    $app.dao().saveRecord(rec);
    console.log("[AUTOMATION] Created deadline for week " + weekNumber + ": " + deadlineTime.toISOString());
  }

  function autoAssignPicks(weekNumber) {
    var allTeams = $app.dao().findRecordsByFilter("teams", "id != ''", "team_name", 0, 0);
    var allUsers = $app.dao().findRecordsByFilter("users", "id != ''", "", 0, 0);
    var allWinners = [];
    try {
      allWinners = $app.dao().findRecordsByFilter("winning_teams", "id != ''", "", 0, 0);
    } catch (e) {}
    var picksCol = $app.dao().findCollectionByNameOrId("picks");
    var count = 0;
    for (var i = 0; i < allUsers.length; i++) {
      var uid = allUsers[i].getId();
      try {
        var ep = $app.dao().findRecordsByFilter("picks", "user_id = '" + uid + "' && week_number = " + weekNumber, "", 1, 0);
        if (ep.length > 0) continue;
      } catch (e) {}
      var userPicks = $app.dao().findRecordsByFilter("picks", "user_id = '" + uid + "'", "", 0, 0);
      if (isUserEliminated(userPicks, allWinners, weekNumber)) continue;
      var usedIds = [];
      for (var j = 0; j < userPicks.length; j++) usedIds.push(userPicks[j].getString("team_id"));
      var sorted = allTeams.slice().sort(function(a, b) {
        return a.getString("team_name").localeCompare(b.getString("team_name"));
      });
      var available = null;
      for (var k = 0; k < sorted.length; k++) {
        if (usedIds.indexOf(sorted[k].getId()) === -1) { available = sorted[k]; break; }
      }
      if (!available) { console.log("[AUTOMATION] No teams for user " + uid); continue; }
      var pick = new Record(picksCol);
      pick.set("user_id", uid);
      pick.set("team_id", available.getId());
      pick.set("week_number", weekNumber);
      $app.dao().saveRecord(pick);
      count++;
    }
    console.log("[AUTOMATION] Auto-assigned " + count + " picks for week " + weekNumber);
  }

  function ensureNextWeekReady(currentWeek) {
    var nextWeek = currentWeek + 1;
    var exists = false;
    try {
      var dl = $app.dao().findRecordsByFilter("deadlines", "week_number = " + nextWeek, "", 1, 0);
      exists = dl.length > 0;
    } catch (e) {}
    if (!exists) createDeadline(nextWeek);
    autoAssignPicks(nextWeek);
  }

  // ---- Main Logic ----
  try {
    // Initial setup if no deadlines exist
    var hasDeadlines = false;
    try {
      var dl = $app.dao().findRecordsByFilter("deadlines", "id != ''", "", 1, 0);
      hasDeadlines = dl.length > 0;
    } catch (e) {}

    if (!hasDeadlines) {
      console.log("[AUTOMATION] First run - initializing at week " + START_WEEK);
      createDeadline(START_WEEK);
      autoAssignPicks(START_WEEK);
      console.log("[AUTOMATION] Initial setup complete");
      return;
    }

    var currentWeek = getCurrentWeek();
    console.log("[AUTOMATION] Cron tick - week " + currentWeek);

    if (weekAlreadyProcessed(currentWeek)) {
      console.log("[AUTOMATION] Week " + currentWeek + " done. Ensuring next week ready.");
      ensureNextWeekReady(currentWeek);
      return;
    }

    var matches;
    try {
      matches = fetchRoundMatches(currentWeek);
    } catch (err) {
      console.log("[AUTOMATION] Fetch failed: " + err);
      return;
    }

    if (!matches || matches.length === 0) {
      console.log("[AUTOMATION] No matches for week " + currentWeek);
      return;
    }

    var allResolved = true;
    var doneCount = 0;
    var skippedCount = 0;
    for (var i = 0; i < matches.length; i++) {
      if (matches[i].strStatus === "Match Finished") {
        doneCount++;
      } else if (isSkippedStatus(matches[i].strStatus)) {
        skippedCount++;
        console.log("[AUTOMATION] Skipping " + matches[i].strStatus.toLowerCase() + " match: " + matches[i].strHomeTeam + " vs " + matches[i].strAwayTeam);
      } else {
        allResolved = false;
      }
    }

    if (allResolved) {
      console.log("[AUTOMATION] All matches resolved (" + doneCount + " finished, " + skippedCount + " skipped). Processing week " + currentWeek);
      markWinners(currentWeek, matches);
      ensureNextWeekReady(currentWeek);
      return;
    }

    var pw = getPollingWindow(matches);
    if (!pw.active) {
      console.log("[AUTOMATION] Skipping - " + pw.reason + " (" + doneCount + "/" + matches.length + " finished, " + skippedCount + " skipped)");
      return;
    }

    console.log("[AUTOMATION] " + doneCount + "/" + matches.length + " finished, " + skippedCount + " skipped. Waiting.");

  } catch (err) {
    console.log("[AUTOMATION] Error: " + String(err));
  }
});
