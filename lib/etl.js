import transformProducts from "./transform-products.js";

const pipeIntoDatabase = async ({
  db,
  fetchFn,
  collectionName,
  ...options
}) => {
  const Collection = db.collection(collectionName);
  await Collection.deleteMany({});
  const entities = await fetchFn(options);
  console.log(`Insert ${entities.length} into ${collectionName}`);
  if (entities?.length) {
    await Collection.insertMany(entities);
  }
};

export async function extract({ akeneo, mongo, journalEntry }) {
  const db = mongo.db();
  const wrap = (fetchFn, collectionName, options) => {
    return pipeIntoDatabase({
      db,
      fetchFn,
      collectionName,
      referenceDate: journalEntry.since,
      ...options,
    });
  };

  await Promise.all([
    wrap(akeneo.getProducts, "akeneo_products"),
    wrap(akeneo.getProductModels, "akeneo_product_models"),
    wrap(akeneo.getProductMedia, "akeneo_product_media"),
    wrap(akeneo.getAttributes, "akeneo_attributes"),
    wrap(akeneo.getAssociationTypes, "akeneo_association_types"),
    wrap(akeneo.getCategories, "akeneo_categories"),
    wrap(akeneo.getChannels, "akeneo_channels"),
    wrap(akeneo.getLocales, "akeneo_locales"),
    wrap(akeneo.getCurrencies, "akeneo_currencies"),
    wrap(akeneo.getFamilies, "akeneo_families"),
  ]);

  const Families = db.collection("akeneo_families");
  const Attributes = db.collection("akeneo_attributes");
  const families = await Families.find({}).toArray();
  const attributes = await Attributes.find({
    type: { $in: ["pim_catalog_simpleselect", "pim_catalog_multiselect"] },
  }).toArray();

  await Promise.all(
    families.map(async (family) => {
      return wrap(akeneo.getFamilyVariants, "akeneo_family_variants", {
        familyCode: family.code,
      });
    })
  );

  await Promise.all(
    attributes.map(async (attribute) => {
      return wrap(akeneo.getAttributeOptions, "akeneo_attribute_options", {
        attributeCode: attribute.code,
      });
    })
  );
}

export async function transform({ mongo, journalEntry, ...rest }) {
  const db = mongo.db();
  const Events = db.collection("unchained_events");
  await Events.deleteMany({});

  await transformProducts({ db, referenceDate: new Date(journalEntry.since) });
}

export async function load({ mongo, unchained }) {
  const db = mongo.db();
  const Events = db.collection("unchained_events");
  const events = await Events.find({}, { _id: 0 }).toArray();
  return unchained.submitEvents(events);
}
