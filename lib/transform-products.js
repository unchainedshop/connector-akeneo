import getValue from "./utils/getValue.js";
import insertBulkOp from "./utils/insertBulkOp.js";

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

const mapVariationResolvers = (product, { variantMap, attributeMap }) => {
  const variantDefinition = variantMap[product.family_variant];
  return variantDefinition.variant_attribute_sets.flatMap((variation) => {
    return product.children.map((childProduct) => {
      const vector = Object.fromEntries(
        variation.axes.map((axe) => {
          const value = getValue(childProduct, axe);
          return [axe, value];
        })
      );
      return { vector, productId: childProduct.identifier };
    });
  });
};

const mapVariations = (product, { variantMap, attributeMap }) => {
  const variantDefinition = variantMap[product.family_variant];
  return variantDefinition.variant_attribute_sets.flatMap((variation) => {
    return variation.axes.map((axe) => {
      const attribute = attributeMap[axe];
      return {
        _id: `${axe}`,
        key: attribute.code,
        type: { pim_catalog_simpleselect: "TEXT" }[attribute.type],
        options: Object.entries(attribute.options).map(([, option]) => {
          return {
            value: option.code,
            content: {
              de: {
                title: option.labels.de_CH || option.code,
              },
            },
          };
        }),
        content: {
          de: {
            title: attribute.labels.de_CH || attribute.code,
          },
        },
      };
    });
  });
};

const mapProductMedia = ({ media }) => {
  if (!media) return undefined;
  return media.map((mediaItem) => {
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

const buildProductEvent = (
  product,
  { referenceDate, attributeMap, variantMap }
) => {
  const created = new Date(product.created);
  const updated = new Date(product.updated);
  const operation =
    created.getTime() > referenceDate.getTime() ? "CREATE" : "UPDATE";
  const type = resolveType(product);

  const rawPublished = getValue(product, "published") || new Date();
  const published = product.enabled ? new Date(rawPublished) : undefined;
  const status = product.enabled ? "ACTIVE" : null;

  const isConfigurableProduct = type === "ConfigurableProduct";
  const isPlanProduct = type === "PlanProduct";

  const labelValue = getValue(product, "labels", { locale: "de_CH" });
  const labels = labelValue
    ? labelValue.split(",").map((item) => item.trim())
    : undefined;

  const event = {
    entity: "PRODUCT",
    operation,
    payload: {
      _id: product.identifier,
      specification: {
        created,
        updated,
        tags: getValue(product, "tags") || [],
        type,
        published,
        status,
        commerce: !isConfigurableProduct ? mapCommerce(product) : undefined,
        variationResolvers: isConfigurableProduct
          ? mapVariationResolvers(product, { attributeMap, variantMap })
          : undefined,
        plan: isPlanProduct ? mapPlanData(product) : undefined,
        meta: {
          ...removeMappedFields(product.values),
          family: product.family,
          groups: product.groups,
        },
        content: {
          de: {
            vendor: getValue(product, "vendor", { locale: "de_CH" }),
            brand: getValue(product, "brand", { locale: "de_CH" }),
            title: getValue(product, "title", { locale: "de_CH" }),
            subtitle: getValue(product, "subtitle", { locale: "de_CH" }),
            description: getValue(product, "description", { locale: "de_CH" }),
            labels,
            slug:
              getValue(product, "slug", { locale: "de_CH" }) ||
              product.identifier,
          },
        },
      },
      media: mapProductMedia(product),
      variations: isConfigurableProduct
        ? mapVariations(product, { attributeMap, variantMap })
        : undefined,
    },
  };
  return event;
};

export default async (options) => {
  const { db, referenceDate } = options;
  const AkeneoProducts = db.collection("akeneo_products");
  const AkeneoProductModels = db.collection("akeneo_product_models");
  const AkeneoLocales = db.collection("akeneo_locales");
  const AkeneoFamilyVariants = db.collection("akeneo_family_variants");
  const AkeneoAttributes = db.collection("akeneo_attributes");
  const AkeneoAttributeOptions = db.collection("akeneo_attribute_options");
  const Events = db.collection("unchained_events");

  const attributeMap = Object.fromEntries(
    await Promise.all(
      (await AkeneoAttributes.find({}).toArray()).map(async (attribute) => {
        const options = Object.fromEntries(
          (
            await AkeneoAttributeOptions.find({
              attributeCode: attribute.code,
            }).toArray()
          ).map((option) => [option.code, option])
        );
        return [
          attribute.code,
          {
            ...attribute,
            options,
          },
        ];
      })
    )
  );

  const variantMap = Object.fromEntries(
    await Promise.all(
      (await AkeneoFamilyVariants.find().toArray()).map(async (variant) => {
        return [variant.code, variant];
      })
    )
  );

  const productsBulkOperationQueue = Events.initializeUnorderedBulkOp();
  const transform = insertBulkOp(
    productsBulkOperationQueue,
    buildProductEvent,
    { attributeMap, variantMap, ...options }
  );
  await AkeneoProducts.aggregate(
    [
      {
        $match: { updated: { $gte: referenceDate } },
      },
      {
        $lookup: {
          from: "akeneo_product_media",
          localField: "values.cover.data",
          foreignField: "code",
          as: "media",
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
        $match: { updated: { $gte: referenceDate } },
      },
      {
        $lookup: {
          from: "akeneo_product_media",
          localField: "values.cover.data",
          foreignField: "code",
          as: "media",
        },
      },
      {
        $lookup: {
          from: "akeneo_products",
          let: { model_identifier: "$code" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$parent", "$$model_identifier"],
                },
              },
            },
          ],
          as: "children",
        },
      },
      {
        $addFields: { isProductModel: true, identifier: "$code" },
      },
    ],
    {
      cursor: { batchSize: 100 },
      allowDiskUse: true,
    }
  ).forEach(transform);
  try {
    await productsBulkOperationQueue.execute();
  } catch (e) {
    if (e.message !== "Invalid Operation, no operations specified") {
      console.warn(e);
      throw e;
    }
  }
};
