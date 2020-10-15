const mediaAggregation = [
  {
    $addFields: {
      mediaCodes: {
        $concatArrays: ["$values.plan_cover.data", "$values.cover.data"],
      },
    },
  },
  {
    $lookup: {
      from: "akeneo_product_media",
      localField: "mediaCodes",
      foreignField: "code",
      as: "media",
    },
  },
];

const buildProductEvent = (product) => {
  console.log(product.family);
  return product;
};

const insertBulkOp = (op, fn) => async (data) => {
  const result = await fn(data);
  return op.insert(result);
};

export default async ({ db }) => {
  const AkeneoProducts = db.collection("akeneo_products");
  const AkeneoProductModels = db.collection("akeneo_product_models");
  const Events = db.collection("unchained_events");

  const createProductsBulkOperationQueue = Events.initializeUnorderedBulkOp();
  const transform = insertBulkOp(
    createProductsBulkOperationQueue,
    buildProductEvent
  );
  await AkeneoProducts.aggregate(mediaAggregation, {
    cursor: { batchSize: 100 },
    allowDiskUse: true,
  }).forEach(transform);
  await AkeneoProductModels.aggregate(
    [
      ...mediaAggregation,
      {
        $addFields: { isProductModel: true },
      },
    ],
    {
      cursor: { batchSize: 100 },
      allowDiskUse: true,
    }
  ).forEach(transform);
  try {
    await createProductsBulkOperationQueue.execute();
  } catch (e) {
    console.warn(e);
  }
};
