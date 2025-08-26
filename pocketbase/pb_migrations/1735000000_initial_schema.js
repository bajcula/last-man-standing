migrate((db) => {
  // Create teams collection
  const teams = new Collection({
    id: "teams",
    name: "teams",
    type: "base",
    system: false,
    schema: [
      {
        id: "name",
        name: "name",
        type: "text",
        required: true,
        unique: true,
        options: {
          min: 1,
          max: 100
        }
      },
      {
        id: "short_name",
        name: "short_name",
        type: "text",
        required: true,
        options: {
          min: 1,
          max: 10
        }
      }
    ]
  });

  // Create picks collection
  const picks = new Collection({
    id: "picks",
    name: "picks",
    type: "base",
    system: false,
    schema: [
      {
        id: "user",
        name: "user",
        type: "relation",
        required: true,
        options: {
          collectionId: "_pb_users_auth_",
          cascadeDelete: true,
          maxSelect: 1
        }
      },
      {
        id: "team",
        name: "team",
        type: "relation",
        required: true,
        options: {
          collectionId: "teams",
          cascadeDelete: false,
          maxSelect: 1
        }
      },
      {
        id: "week",
        name: "week",
        type: "number",
        required: true,
        options: {
          min: 1,
          max: 38
        }
      }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_user_week ON picks (user, week)",
      "CREATE UNIQUE INDEX idx_user_team ON picks (user, team)"
    ]
  });

  // Create deadlines collection
  const deadlines = new Collection({
    id: "deadlines",
    name: "deadlines",
    type: "base",
    system: false,
    schema: [
      {
        id: "week",
        name: "week",
        type: "number",
        required: true,
        unique: true,
        options: {
          min: 1,
          max: 38
        }
      },
      {
        id: "deadline",
        name: "deadline",
        type: "date",
        required: true
      },
      {
        id: "is_closed",
        name: "is_closed",
        type: "bool",
        required: false,
        options: {}
      }
    ]
  });

  return Dao(db).saveCollection(teams) &&
         Dao(db).saveCollection(picks) &&
         Dao(db).saveCollection(deadlines);
}, (db) => {
  return Dao(db).deleteCollection("teams") &&
         Dao(db).deleteCollection("picks") &&
         Dao(db).deleteCollection("deadlines");
});