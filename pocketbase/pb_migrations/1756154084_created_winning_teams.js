/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "tuzrkm93bp62rcl",
    "created": "2025-08-25 20:34:44.459Z",
    "updated": "2025-08-25 20:34:44.459Z",
    "name": "winning_teams",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "y7zilwep",
        "name": "week_number",
        "type": "number",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "noDecimal": false
        }
      },
      {
        "system": false,
        "id": "vshdz82w",
        "name": "team_id",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "4dpvamdtkd7g5yd",
          "cascadeDelete": false,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": [
            "team_name"
          ]
        }
      }
    ],
    "indexes": [],
    "listRule": "",
    "viewRule": "",
    "createRule": "",
    "updateRule": "",
    "deleteRule": "",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("tuzrkm93bp62rcl");

  return dao.deleteCollection(collection);
})
