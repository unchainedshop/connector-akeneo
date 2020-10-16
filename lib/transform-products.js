import getValue from "./utils/getValue.js";

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

const resolveType = (product) => {
  if (product.isProductModel) return "ConfigurableProduct";
  if (product.family === "PLAN") return "PlanProduct";
  return "SimpleProduct";
};

const mapPlanData = (product) => {
  if (product.family !== "PLAN" || product.isProductModel) return undefined;
  const billingInterval = getValue(product, "billing_interval_type");
  const billingIntervalCount = Number(
    parseFloat(getValue(product, "billing_interval_units"))
  );
  console.log({ billingIntervalCount });

  return {
    billingInterval,
    billingIntervalCount: Number.isNaN(billingIntervalCount)
      ? 1
      : billingIntervalCount,
    usageCalculationType: "LICENSED",
  };
};

const mapCommerce = (product) => {
  if (product.isProductModel) return undefined;
  const catalogPrice = getValue(product, "catalog_price");
  if (!catalogPrice) return undefined;
  return {
    salesUnit: "ST",
    salesQuantityPerUnit: "1",
    defaultOrderQuantity: "1",
    pricing: catalogPrice.map((price) => ({
      isTaxable: true,
      isNetPrice: true,
      countryCode: "CH",
      currencyCode: price.currency,
      amount: Number(parseFloat(price.amount) * 100),
    })),
  };
};

const mapVariationResolvers = (product) => {
  if (product.isProductModel) return [];
  // [
  //   {
  //     vector: {
  //       color: "red",
  //     },
  //     productId: "B",
  //   },
  // ]
  return undefined;
};

const mapVariations = (product) => {
  if (product.isProductModel) {
    // return [
    //   {
    //     _id: null,
    //     created: null,
    //     updated: null,
    //     key: "color",
    //     type: "COLOR",
    //     options: [
    //       {
    //         value: "ff0000",
    //         content: {
    //           de: {
    //             created: null,
    //             updated: null,
    //             title: "Rot",
    //             subtitle: "",
    //           },
    //         },
    //       },
    //     ],
    //     content: {
    //       de: {
    //         created: null,
    //         updated: null,
    //         title: "Farbe",
    //         subtitle: "Farbvariante",
    //       },
    //     },
    //   },
    // ]
    return [];
  }
  return undefined;
};

const mapProductMedia = ({ media }) => {
  return media?.map((mediaItem) => {
    return {
      _id: null,
      created: null,
      updated: null,
      asset: {
        _id: null,
        url:
          "https://www.story.one/media/images/poop-4108423_1920.width-1600.format-jpeg.jpg",
      },
      tags: ["big"],
      meta: {},
      content: {
        de: {
          created: null,
          updated: null,
          title: "Produktname",
          subtitle: "Short description",
        },
      },
    };
  });
};

const buildProductEvent = (product, { referenceDate }) => {
  const created = new Date(product.created);
  const updated = new Date(product.updated);
  const operation =
    created.getTime() > referenceDate.getTime() ? "CREATE" : "UPDATE";
  const tags = [];
  const type = resolveType(product);

  const rawPublished = getValue(product, "published");
  const published = rawPublished && new Date(rawPublished);

  const event = {
    entity: "PRODUCT",
    operation,
    payload: {
      _id: product._id,
      specification: {
        created: created,
        updated: updated,
        tags,
        type,
        published,
        commerce: mapCommerce(product),
        variationResolvers: mapVariationResolvers(product),
        plan: mapPlanData(product),
        meta: product.values,
        content: {
          base: {
            vendor: getValue(product, "publisher"),
            brand: null,
            title: getValue(product, "title"),
            subtitle: getValue(product, "subtitle"),
            description: getValue(product, "description"),
          },
        },
      },
      media: mapProductMedia(product),
      variations: mapVariations(product),
    },
  };
  return event;
};

const insertBulkOp = (op, fn, options) => async (data) => {
  const result = await fn(data, options);
  return op.insert(result);
};

export default async (options) => {
  const { db } = options;
  const AkeneoProducts = db.collection("akeneo_products");
  const AkeneoProductModels = db.collection("akeneo_product_models");
  const AkeneoLocales = db.collection("akeneo_locales");
  const Events = db.collection("unchained_events");

  const createProductsBulkOperationQueue = Events.initializeUnorderedBulkOp();
  const transform = insertBulkOp(
    createProductsBulkOperationQueue,
    buildProductEvent,
    options
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
