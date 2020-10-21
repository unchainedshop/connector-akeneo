import getValue from "./utils/getValue.js";
import insertBulkOp from "./utils/insertBulkOp.js";

const buildAssortmentEvent = (
  product,
  { referenceDate, associationTypeMap }
) => {
  const created = new Date(product.created);
  const updated = new Date(product.updated);
  const operation =
    created.getTime() > referenceDate.getTime() ? "CREATE" : "UPDATE";

  const products = Object.values(associationTypeMap).flatMap(
    (associationType) =>
      [
        ...product.associations[associationType.code].products,
        ...product.associations[associationType.code].product_models,
      ].map((id) => ({
        productId: id,
        tags: ["group", associationType.code],
      }))
  );
  products.push({
    productId: product.identifier,
    tags: ["group", "primary_product"],
  });

  const event = {
    entity: "ASSORTMENT",
    operation: "CREATE",
    payload: {
      _id: `group.${product.identifier}`,
      specification: {
        isActive: true,
        isBase: false,
        isRoot: false,
        tags: ["association", `group:${product.identifier}`],
        meta: {},
        content: {
          de: {
            title: `Product Group of ${product.identifier}`,
            slug: `group-${product.identifier}`,
          },
        },
      },
      products,
    },
  };
  return event;
};

export default async (options) => {
  const { db } = options;
  const AkeneoProducts = db.collection("akeneo_products");
  const AkeneoProductModels = db.collection("akeneo_product_models");
  const AkeneoAssociationTypes = db.collection("akeneo_association_types");
  const Events = db.collection("unchained_events");

  const associationTypeMap = Object.fromEntries(
    await Promise.all(
      (await AkeneoAssociationTypes.find().toArray()).map(
        async (associationType) => {
          return [associationType.code, associationType];
        }
      )
    )
  );

  const createAssortmentsBulkOperationQueue = Events.initializeUnorderedBulkOp();
  const transform = insertBulkOp(
    createAssortmentsBulkOperationQueue,
    buildAssortmentEvent,
    { associationTypeMap, ...options }
  );

  const exists = {
    $exists: true,
    $not: { $size: 0 },
  };
  const productSelector = Object.keys(associationTypeMap).flatMap((key) => {
    return [
      { [`associations.${key}.products`]: exists },
      { [`associations.${key}.product_models`]: exists },
      // { [`associations.${key}.groups`]: exists },
    ];
  });
  await AkeneoProducts.aggregate([{ $match: { $or: productSelector } }], {
    cursor: { batchSize: 100 },
    allowDiskUse: true,
  }).forEach(transform);

  await AkeneoProductModels.aggregate(
    [
      { $match: { $or: productSelector } },
      {
        $addFields: { identifier: "$code" },
      },
    ],
    {
      cursor: { batchSize: 100 },
      allowDiskUse: true,
    }
  ).forEach(transform);
  try {
    await createAssortmentsBulkOperationQueue.execute();
  } catch (e) {
    if (e.message !== "Invalid Operation, no operations specified") {
      console.warn(e);
    }
  }
};
