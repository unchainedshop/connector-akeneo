import transformProducts from "./transform-products.js";

const pipeIntoDatabase = async ({
  db,
  referenceDate,
  fetchFn,
  collectionName,
}) => {
  const Collection = db.collection(collectionName);
  await Collection.deleteMany({});
  const entities = await fetchFn({ referenceDate });
  console.log(`Insert ${entities.length} into ${collectionName}`);
  if (entities?.length) {
    await Collection.insertMany(entities);
  }
};

export async function extract({ akeneo, mongo, journalEntry }) {
  const db = mongo.db();
  const wrap = (fetchFn, collectionName) => {
    return pipeIntoDatabase({
      db,
      referenceDate: journalEntry.since,
      fetchFn,
      collectionName,
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
  ]);
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
  const events = await Events.find({}, { fields: { _id: false } }).toArray();
  return unchained.submitEvents(events);
}
