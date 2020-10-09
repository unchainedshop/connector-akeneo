import "./lib/node_env.js";
import { start, stop } from "./lib/remotes/mongodb-dev.js";
import mongodb from "mongodb";
import AkeneoAPI from "./lib/remotes/akeneo.js";
import UnchainedAPI from "./lib/remotes/unchained.js";
import * as Journal from "./lib/journal.js";
import { extract, transform, load } from "./lib/etl.js";

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
    const journalEntry = await Journal.start({ mongo });

    const context = {
      mongo,
      akeneo,
      unchained,
      journalEntry,
    };

    try {
      await extract(context);
    } finally {
      await Journal.reportFinalStatus(
        {
          status: Journal.CompletionStatus.FAILED_EXTRACT,
        },
        context
      );
    }

    try {
      await transform(context);
    } finally {
      await Journal.reportFinalStatus(
        {
          status: Journal.CompletionStatus.FAILED_TRANSFORM,
        },
        context
      );
    }

    try {
      await load(context);
    } finally {
      await Journal.reportFinalStatus(
        {
          status: Journal.CompletionStatus.FAILED_LOAD,
        },
        context
      );
    }

    await Journal.reportFinalStatus(
      {
        status: Journal.CompletionStatus.COMPLETE,
      },
      context
    );
  } finally {
    await mongo.close();
  }
  await stop();
  process.exit();
}

run().catch(console.error);
