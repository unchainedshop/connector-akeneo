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

const resolveType = (product) => {
  if (product.isProductModel) return "ConfigurableProduct";
  return getValue(product, "unchainedProductType") || "SimpleProduct";
};

const mapPlanData = (product) => {
  const billingInterval = getValue(product, "billing_interval_type");
  const billingIntervalCount = Number(
    parseFloat(getValue(product, "billing_interval_units"))
  );
  console.log(product);

  return {
    billingInterval,
    billingIntervalCount: Number.isNaN(billingIntervalCount)
      ? 1
      : billingIntervalCount,
    usageCalculationType: "LICENSED",
  };
};

const mapCommerce = (product) => {
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
  // {
  //     "_id" : ObjectId("5f899d2881845d40c6c9d612"),
  //     "_links" : {
  //         "self" : {
  //             "href" : "https://pim.getmorebrain.com/api/rest/v1/media-files/9/8/8/3/9883598cb9e91a7f23a47b37215f7c7e83ed72c3_69363971_45b6_4d2e_8266_d87c3a447399.jpg"
  //         },
  //         "download" : {
  //             "href" : "https://pim.getmorebrain.com/api/rest/v1/media-files/9/8/8/3/9883598cb9e91a7f23a47b37215f7c7e83ed72c3_69363971_45b6_4d2e_8266_d87c3a447399.jpg/download"
  //         }
  //     },
  //     "code" : "9/8/8/3/9883598cb9e91a7f23a47b37215f7c7e83ed72c3_69363971_45b6_4d2e_8266_d87c3a447399.jpg",
  //     "original_filename" : "69363971-45b6-4d2e-8266-d87c3a447399.jpg",
  //     "mime_type" : "image/jpeg",
  //     "size" : 319783,
  //     "extension" : "jpg",
  //     "headers" : {
  //         "Authorization" : "Bearer MTk4NmFiZDFlMzEzNjAyZDhiMmEyOTE1ZDUzMjhjYTI2MDRhMzdjNGQzMGY1YTYzZjhhOTFmOTUyMjVmNjA1OA"
  //     }
  // }
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
      // tags: ["big"],
      // meta: {},
      // content: {
      //   de: {
      //     created: null,
      //     updated: null,
      //     title: "Produktname",
      //     subtitle: "Short description",
      //   },
      // },
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

  console.log(product);
  const event = {
    entity: "PRODUCT",
    operation,
    payload: {
      _id: product.identifier,
      specification: {
        created: created,
        updated: updated,
        tags: getValue(product, "vendor"),
        type,
        published,
        commerce:
          type !== "ConfigurableProduct" ? mapCommerce(product) : undefined,
        variationResolvers:
          type === "ConfigurableProduct"
            ? mapVariationResolvers(product)
            : undefined,
        plan: type === "PlanProduct" ? mapPlanData(product) : undefined,
        meta: product.values,
        content: {
          de: {
            vendor: getValue(product, "vendor"),
            brand: getValue(product, "brand"),
            title: getValue(product, "title"),
            subtitle: getValue(product, "subtitle"),
            description: getValue(product, "description"),
            labels: getValue(product, "labels")
              ?.split(",")
              .map((item) => item.trim()),
            slug: getValue(product, "slug") || product.identifier,
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
