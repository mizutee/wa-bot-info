const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = process.env.MONGO_URL;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const db = client.db('Bot')

module.exports = { db, client }
