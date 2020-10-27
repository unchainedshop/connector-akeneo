import getValue from "./utils/getValue.js";
import insertBulkOp from "./utils/insertBulkOp.js";

const buildAssortmentEvent = (
  channel,
  { referenceDate, allChannels, alreadyExistingAssortments }
) => {
  const _id = `channel.${channel.code}`;
  const exists = alreadyExistingAssortments.some(
    (assortment) => assortment.payload._id === _id
  );
  const operation = exists ? "UPDATE" : "CREATE";

  const localeTags = channel.locales.map((locale) => `locale:${locale}`);
  const currencyTags = channel.currencies.map(
    (currency) => `currency:${currency}`
  );

  const event = {
    entity: "ASSORTMENT",
    operation,
    payload: {
      _id,
      specification: {
        isActive: true,
        isBase: false,
        isRoot: true,
        tags: ["channel", ...localeTags, ...currencyTags],
        meta: {},
        content: {
          de: {
            title: channel.labels.de_CH,
            slug: channel.code,
          },
        },
      },
      products: [],
      children: [
        {
          assortmentId: channel.category_tree,
          tags: ["channel"],
          meta: {},
        },
      ],
    },
  };
  return event;
};

export default async (options) => {
  const { db, referenceDate } = options;
  const AkeneoChannels = db.collection("akeneo_channels");
  const Events = db.collection("unchained_events");
  const SubmittedEvents = db.collection("unchained_submitted_events");

  const alreadyExistingAssortments = await SubmittedEvents.find({
    entity: "ASSORTMENT",
    operation: "CREATE",
  }).toArray();

  const allChannels = await AkeneoChannels.find({}).toArray();

  const assortmentsBulkOperationQueue = Events.initializeUnorderedBulkOp();
  const transform = insertBulkOp(
    assortmentsBulkOperationQueue,
    buildAssortmentEvent,
    {
      ...options,
      alreadyExistingAssortments,
      allChannels,
    }
  );

  await allChannels.forEach(transform);

  try {
    await assortmentsBulkOperationQueue.execute();
  } catch (e) {
    if (e.message !== "Invalid Operation, no operations specified") {
      console.warn(e);
      throw e;
    }
  }
};
