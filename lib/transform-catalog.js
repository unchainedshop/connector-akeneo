import getValue from "./utils/getValue.js";
import insertBulkOp from "./utils/insertBulkOp.js";

const findLevel = (category, { allCategories, level = 0 }) => {
  const parent = allCategories.find(
    (someCategory) => someCategory.code === category.parent
  );
  if (!parent) return level;
  return findLevel(parent, { allCategories, level: level + 1 });
};

const buildAssortmentEvent = (
  category,
  { referenceDate, allCategories, allProducts, alreadyExistingAssortments }
) => {
  const exists = alreadyExistingAssortments.some(
    (assortment) => assortment.payload._id === category.code
  );
  const operation = exists ? "UPDATE" : "CREATE";

  const children = allCategories
    .filter((childCategory) => childCategory.parent === category.code)
    .map((childCategory) => {
      return {
        assortmentId: childCategory.code,
        tags: ["taxonomy"],
        meta: {},
      };
    });

  const products = allProducts
    .filter((product) => product.categories.includes(category.code))
    .map((product) => ({
      productId: product.identifier,
      tags: ["taxonomy"],
      meta: {},
    }));

  const event = {
    entity: "ASSORTMENT",
    operation,
    payload: {
      _id: category.code,
      specification: {
        isActive: true,
        isBase: false,
        isRoot: category.parent === null,
        tags: [
          "taxonomy",
          `taxonomy-level:${findLevel(category, { allCategories })}`,
        ],
        meta: {},
        content: {
          de: {
            title: category.labels.de_CH,
            slug: category.code,
          },
        },
      },
      products,
      children,
    },
  };
  return event;
};

export default async (options) => {
  const { db, referenceDate } = options;
  const AkeneoCategories = db.collection("akeneo_categories");
  const AkeneoProducts = db.collection("akeneo_products");
  const AkeneoProductModels = db.collection("akeneo_product_models");
  const Events = db.collection("unchained_events");
  const SubmittedEvents = db.collection("unchained_submitted_events");

  const alreadyExistingAssortments = await SubmittedEvents.find({
    entity: "ASSORTMENT",
    operation: "CREATE",
  }).toArray();

  const allProductModels = await AkeneoProductModels.aggregate(
    [
      {
        $addFields: { identifier: "$code" },
      },
    ],
    {
      cursor: { batchSize: 100 },
      allowDiskUse: true,
    }
  ).toArray();
  const allProducts = await AkeneoProducts.find().toArray();
  const allCategories = await AkeneoCategories.find({}).toArray();

  const assortmentsBulkOperationQueue = Events.initializeUnorderedBulkOp();
  const transform = insertBulkOp(
    assortmentsBulkOperationQueue,
    buildAssortmentEvent,
    {
      ...options,
      alreadyExistingAssortments,
      allCategories,
      allProducts: [...allProducts, ...allProductModels],
    }
  );

  await allCategories.forEach(transform);

  try {
    await assortmentsBulkOperationQueue.execute();
  } catch (e) {
    if (e.message !== "Invalid Operation, no operations specified") {
      console.warn(e);
      throw e;
    }
  }
};
