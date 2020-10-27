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

  if (!products || !products.length) {
    return null;
  }
  return {
    entity: "ASSORTMENT",
    operation: operation,
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
};

export default async (options) => {
  const { db, referenceDate } = options;
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

  const assortmentsBulkOperationQueue = Events.initializeUnorderedBulkOp();
  const transform = insertBulkOp(
    assortmentsBulkOperationQueue,
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
  await AkeneoProducts.aggregate(
    [
      {
        $match: {
          $or: productSelector,
          updated: { $gte: referenceDate },
        },
      },
    ],
    {
      cursor: { batchSize: 100 },
      allowDiskUse: true,
    }
  ).forEach(transform);

  await AkeneoProductModels.aggregate(
    [
      {
        $match: {
          $or: productSelector,
          updated: { $gte: referenceDate },
        },
      },
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
    await assortmentsBulkOperationQueue.execute();
  } catch (e) {
    if (e.message !== "Invalid Operation, no operations specified") {
      console.warn(e);
      throw e;
    }
  }
};
