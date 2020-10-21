import getValue from "./utils/getValue.js";
import insertBulkOp from "./utils/insertBulkOp.js";

const buildAssortmentEvent = (category, { referenceDate }) => {
  const created = new Date(category.created);
  const updated = new Date(category.updated);
  const operation =
    created.getTime() > referenceDate.getTime() ? "CREATE" : "UPDATE";

  const event = {
    entity: "ASSORTMENT",
    operation: "CREATE",
    payload: {
      _id: `group.${category.code}`,
      specification: {
        isActive: true,
        isBase: false,
        isRoot: false,
        tags: ["association", `group:${category.code}`],
        meta: {},
        content: {
          de: {
            title: `Product Group of ${category.code}`,
            slug: `group-${category.code}`,
          },
        },
      },
      products: [],
      children: [
        // {
        //   _id: null,
        //   created: null,
        //   updated: null,
        //   assortmentId: "assortment2",
        //   tags: [],
        //   meta: {},
        // },
      ],
    },
  };
  return event;
};

export default async (options) => {
  const { db } = options;
  const AkeneoCategories = db.collection("akeneo_categories");
  const Events = db.collection("unchained_events");

  const createAssortmentsBulkOperationQueue = Events.initializeUnorderedBulkOp();
  const transform = insertBulkOp(
    createAssortmentsBulkOperationQueue,
    buildAssortmentEvent,
    options
  );

  await AkeneoCategories.find({}).forEach(transform);

  try {
    await createAssortmentsBulkOperationQueue.execute();
  } catch (e) {
    if (e.message !== "Invalid Operation, no operations specified") {
      console.warn(e);
    }
  }
};
