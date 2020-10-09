import { MongoMemoryServer } from "mongodb-memory-server";

let mongod;

export const start = async function start() {
  mongod = new MongoMemoryServer();

  const uri = await mongod.getUri();
  const port = await mongod.getPort();
  const dbPath = await mongod.getDbPath();
  const dbName = await mongod.getDbName();

  return { uri, port, dbPath, dbName };
};

export const stop = function stop() {
  mongod.stop();
};
