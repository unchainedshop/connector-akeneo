import "./lib/node_env.js";
import { start, stop } from "./lib/remotes/mongodb-dev.js";
import mongodb from "mongodb";
import * as configFetcher from "./config-fetcher.js";
import AkeneoAPI from "./lib/remotes/akeneo.js";
import UnchainedAPI from "./lib/remotes/unchained.js";
import * as Journal from "./lib/journal.js";
import { extract, transform, load } from "./lib/etl.js";

const { MongoClient } = mongodb;
const { NODE_ENV, MONGO_URL, RESET_JOURNAL } = process.env;

const getMongoDBUri = async (options) => {
  if (options.mongoUrl || MONGO_URL) return options.mongoUrl || MONGO_URL;

  if (NODE_ENV === "development") {
    const result = await start();
    if (result.uri) return result.uri;
  }
  throw new Error(
    "You have to specify a MONGO_URL so the connector can do Differential Sync to Unchained"
  );
};

export async function run() {
  const config = await configFetcher.fetchConfig();
  const uri = await getMongoDBUri(config);
  const mongo = new MongoClient(uri, { useUnifiedTopology: true });
  const akeneo = AkeneoAPI(config);
  const unchained = UnchainedAPI(config);

  try {
    await mongo.connect();
    const journalEntry = await Journal.start({ reset: !!RESET_JOURNAL, mongo });

    const context = {
      mongo,
      akeneo,
      unchained,
      journalEntry,
    };

    try {
      await extract(context);
    } catch (e) {
      await Journal.reportFinalStatus(
        {
          status: Journal.CompletionStatus.FAILED_EXTRACT,
        },
        context
      );
      throw e;
    }

    try {
      await transform(context);
    } catch (e) {
      await Journal.reportFinalStatus(
        {
          status: Journal.CompletionStatus.FAILED_TRANSFORM,
        },
        context
      );
      throw e;
    }

    try {
      const eventIds = await load(context);
      await Journal.reportFinalStatus(
        {
          eventIds,
          status: Journal.CompletionStatus.COMPLETE,
        },
        context
      );
    } catch (e) {
      await Journal.reportFinalStatus(
        {
          status: Journal.CompletionStatus.FAILED_LOAD,
        },
        context
      );
      throw e;
    }
  } finally {
    await mongo.close();
  }
  try {
    await stop();
  } catch (e) {}
  process.exit();
}
