import "./lib/node_env.js";
import { start, stop } from "./lib/remotes/mongodb-dev.js";
import mongodb from "mongodb";
import AkeneoAPI from "./lib/remotes/akeneo.js";
import UnchainedAPI from "./lib/remotes/unchained.js";

const { MongoClient } = mongodb;
const { NODE_ENV, MONGO_URL } = process.env;

const getMongoDBUri = async () => {
  if (MONGO_URL) return MONGO_URL;
  if (NODE_ENV !== "production") {
    const result = await start();
    if (result.uri) return result.uri;
  }
  throw new Error(
    "You have to specify a MONGO_URL so the connector can do Differential Sync to Unchained"
  );
};

export default async function run() {
  const uri = await getMongoDBUri();
  const mongo = new MongoClient(uri, { useUnifiedTopology: true });
  const akeneo = AkeneoAPI();
  const unchained = UnchainedAPI();

  try {
    await mongo.connect();
    await akeneo.getProducts();
    await unchained.submitEvents([]);
  } finally {
    await mongo.close();
  }
  await stop();
  process.exit();
}

run().catch(console.dir);
