import getValue from "./utils/getValue.js";

const mediaAggregation = [
  {
    $lookup: {
      from: "akeneo_product_media",
      localField: "values.cover.data",
      foreignField: "code",
      as: "media",
    },
  },
];

const removeMappedFields = ({
  unchainedProductType,
  billingInterval,
  billingIntervalCount,
  usageCalculationType,
  tags,
  title,
  vendor,
  brand,
  subtitle,
  description,
  labels,
  slug,
  pricing,
  isTaxable,
  isNetPrice,
  published,
  salesUnit,
  salesQuantityPerUnit,
  defaultOrderQuantity,
  cover,
  ...values
}) => {
  return values;
};

const resolveType = (product) => {
  if (product.isProductModel) return "ConfigurableProduct";
  return getValue(product, "unchainedProductType") || "SimpleProduct";
};

const mapPlanData = (product) => {
  const billingIntervalCount = Number(
    parseInt(getValue(product, "billingIntervalCount"))
  );
  return {
    billingInterval: getValue(product, "billingInterval"),
    billingIntervalCount: Number.isNaN(billingIntervalCount)
      ? 1
      : billingIntervalCount,
    usageCalculationType: getValue(product, "usageCalculationType"),
  };
};

const mapCommerce = (product) => {
  const pricing = getValue(product, "pricing");
  const isTaxable = getValue(product, "isTaxable");
  const isNetPrice = getValue(product, "isNetPrice");
  if (!pricing) return undefined;
  return {
    salesUnit: getValue(product, "salesUnit"),
    salesQuantityPerUnit: getValue(product, "salesQuantityPerUnit"),
    defaultOrderQuantity: getValue(product, "defaultOrderQuantity"),
    pricing: pricing.map((price) => ({
      isTaxable: true,
      isNetPrice: true,
      countryCode: "CH",
      currencyCode: price.currency,
      amount: Math.round(parseFloat(price.amount) * 100),
    })),
  };
};

const mapVariationResolvers = (product) => {
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
};

const mapProductMedia = ({ media }) => {
  return media?.map((mediaItem) => {
    return {
      _id: mediaItem.code,
      asset: {
        _id: `${mediaItem.code}-${mediaItem.size}`,
        url: mediaItem._links.download.href,
        fileName: mediaItem.original_filename,
        type: mediaItem.mime_type,
        size: mediaItem.size,
        headers: mediaItem.headers,
      },
    };
  });
};

const buildProductEvent = (product, { referenceDate }) => {
  const created = new Date(product.created);
  const updated = new Date(product.updated);
  const operation =
    created.getTime() > referenceDate.getTime() ? "CREATE" : "UPDATE";
  const type = resolveType(product);

  const rawPublished = getValue(product, "published");
  const published = rawPublished && new Date(rawPublished);
  const status = rawPublished ? "ACTIVE" : null;

  const event = {
    entity: "PRODUCT",
    operation,
    payload: {
      _id: product.identifier,
      specification: {
        created: created,
        updated: updated,
        tags: getValue(product, "tags") || [],
        type,
        published,
        status,
        commerce:
          type !== "ConfigurableProduct" ? mapCommerce(product) : undefined,
        variationResolvers:
          type === "ConfigurableProduct"
            ? mapVariationResolvers(product)
            : undefined,
        plan: type === "PlanProduct" ? mapPlanData(product) : undefined,
        meta: removeMappedFields(product.values),
        content: {
          de: {
            vendor: getValue(product, "vendor", { locale: "de_CH" }),
            brand: getValue(product, "brand", { locale: "de_CH" }),
            title: getValue(product, "title", { locale: "de_CH" }),
            subtitle: getValue(product, "subtitle", { locale: "de_CH" }),
            description: getValue(product, "description", { locale: "de_CH" }),
            labels: getValue(product, "labels", { locale: "de_CH" })
              ?.split(",")
              .map((item) => item.trim()),
            slug:
              getValue(product, "slug", { locale: "de_CH" }) ||
              product.identifier,
          },
        },
      },
      media: mapProductMedia(product),
      variations:
        type === "ConfigurableProduct" ? mapVariations(product) : undefined,
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
