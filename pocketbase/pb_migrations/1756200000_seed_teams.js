/// <reference path="../pb_data/types.d.ts" />

migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("teams");

  const teams = [
    { team_name: "Arsenal", team_short_name: "ARS" },
    { team_name: "Aston Villa", team_short_name: "AVL" },
    { team_name: "Bournemouth", team_short_name: "BOU" },
    { team_name: "Brentford", team_short_name: "BRE" },
    { team_name: "Brighton and Hove Albion", team_short_name: "BHA" },
    { team_name: "Burnley", team_short_name: "BUR" },
    { team_name: "Chelsea", team_short_name: "CHE" },
    { team_name: "Crystal Palace", team_short_name: "CRY" },
    { team_name: "Everton", team_short_name: "EVE" },
    { team_name: "Fulham", team_short_name: "FUL" },
    { team_name: "Leeds United", team_short_name: "LEE" },
    { team_name: "Liverpool", team_short_name: "LIV" },
    { team_name: "Manchester City", team_short_name: "MCI" },
    { team_name: "Manchester United", team_short_name: "MUN" },
    { team_name: "Newcastle United", team_short_name: "NEW" },
    { team_name: "Nottingham Forest", team_short_name: "NFO" },
    { team_name: "Sunderland", team_short_name: "SUN" },
    { team_name: "Tottenham Hotspur", team_short_name: "TOT" },
    { team_name: "West Ham United", team_short_name: "WHU" },
    { team_name: "Wolverhampton Wanderers", team_short_name: "WOL" },
  ];

  for (var i = 0; i < teams.length; i++) {
    var record = new Record(collection);
    record.set("team_name", teams[i].team_name);
    record.set("team_short_name", teams[i].team_short_name);
    dao.saveRecord(record);
  }
}, (db) => {
  const dao = new Dao(db);
  const records = dao.findRecordsByFilter("teams", "id != ''", "", 0, 0);
  for (var i = 0; i < records.length; i++) {
    dao.deleteRecord(records[i]);
  }
});
