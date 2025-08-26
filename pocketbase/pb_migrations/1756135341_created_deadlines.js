/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "8kqlqkuxrf1cvcr",
    "created": "2025-08-25 15:22:21.857Z",
    "updated": "2025-08-25 15:22:21.857Z",
    "name": "deadlines",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "0mr4x10w",
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
        "id": "r3jebqw2",
        "name": "deadline_time",
        "type": "date",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": "",
          "max": ""
        }
      },
      {
        "system": false,
        "id": "990nocip",
        "name": "is_closed",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
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
  const collection = dao.findCollectionByNameOrId("8kqlqkuxrf1cvcr");

  return dao.deleteCollection(collection);
})
