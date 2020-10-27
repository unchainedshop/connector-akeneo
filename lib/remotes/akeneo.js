import fetch from "node-fetch";

const authenticate = async function authenticate({
  user,
  password,
  clientId,
  secret,
  endpoint,
}) {
  const headers = {
    Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString(
      "base64"
    )}`,
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({
    grant_type: "password",
    username: user,
    password: password,
  });
  const result = await fetch(`${endpoint}/api/oauth/v1/token`, {
    method: "POST",
    headers,
    body,
  });
  const { access_token } = await result.json();
  return access_token;
};

const wrapFilterUpdatedSince = (date) => {
  const parsedDate = new Date(date)
    .toISOString()
    .replace(/T/, " ") // replace T with a space
    .replace(/\..+/, ""); // delete the dot and everything after
  return JSON.stringify({ updated: [{ operator: ">", value: parsedDate }] });
};

const AkeneoAPI = function AkeneoAPI(options) {
  const endpoint = options.akeneoEndpoint || process.env.AKENEO_ENDPOINT;
  const tokenPromise = authenticate({
    user: options.akeneoUser || process.env.AKENEO_USER,
    password: options.akeneoPassword || process.env.AKENEO_PASSWORD,
    clientId: options.akeneoClientId || process.env.AKENEO_CLIENT_ID,
    secret: options.akeneoClientSecret || process.env.AKENEO_CLIENT_SECRET,
    endpoint,
  });

  const akeneoFetch = async (path, { search, limit, ...params }, options) => {
    const token = await tokenPromise;
    const querySegments = [
      limit && `limit=${limit}`,
      search && `search=${search}`,
    ]
      .filter(Boolean)
      .join("&");
    const query = querySegments ? `?${querySegments}` : "";

    const fetchNext = async (url) => {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(options ? options.headers : {}),
        },
      });
      if (response.status !== 200) {
        throw new Error(
          `Akeneo failed to fetch ${url} with Error ${response.statusText}`
        );
      }
      const result = await response.json();
      if (!result) return undefined;
      if (result._links.next) {
        return [
          ...result._embedded.items,
          ...(await fetchNext(result._links.next.href)),
        ];
      }
      return result._embedded ? result._embedded.items : undefined;
    };

    return fetchNext(`${endpoint}${path}${query}`);
  };

  return {
    async getProducts({ referenceDate }) {
      const items = await akeneoFetch("/api/rest/v1/products", {
        limit: 100,
        // search: wrapFilterUpdatedSince(referenceDate),
      });
      if (!items) return undefined;
      return items.map((item) => {
        return {
          ...item,
          updated: new Date(item.updated),
          created: new Date(item.created),
        };
      });
    },
    async getProductModels({ referenceDate }) {
      const items = await akeneoFetch("/api/rest/v1/product-models", {
        limit: 100,
        // search: wrapFilterUpdatedSince(referenceDate),
      });
      if (!items) return undefined;
      return items.map((item) => {
        return {
          ...item,
          updated: new Date(item.updated),
          created: new Date(item.created),
        };
      });
    },
    async getProductMedia({ referenceDate }) {
      const token = await tokenPromise;
      const items = await akeneoFetch("/api/rest/v1/media-files", {
        limit: 100,
      });
      if (!items) return undefined;
      return items.map((item) => {
        return {
          ...item,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        };
      });
    },
    async getAttributes({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/attributes", {
        limit: 100,
      });
    },
    async getAssociationTypes({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/association-types", {
        limit: 100,
      });
    },
    async getCategories({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/categories", {
        limit: 100,
      });
    },
    async getChannels({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/channels", {
        limit: 100,
      });
    },
    async getLocales({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/locales", {
        limit: 100,
      });
    },
    async getCurrencies({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/currencies", {
        limit: 100,
      });
    },
    async getFamilies({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/families", {
        limit: 100,
      });
    },
    async getFamilyVariants({ referenceDate, familyCode }) {
      const items = await akeneoFetch(
        `/api/rest/v1/families/${familyCode}/variants`,
        {
          limit: 100,
        }
      );
      if (!items) return undefined;
      return items.map((item) => {
        return {
          ...item,
          familyCode,
        };
      });
    },
    async getAttributeOptions({ referenceDate, attributeCode }) {
      const items = await akeneoFetch(
        `/api/rest/v1/attributes/${attributeCode}/options`,
        {
          limit: 100,
        }
      );
      if (!items) return undefined;
      return items.map((item) => {
        return {
          ...item,
          attributeCode,
        };
      });
    },
  };
};

export default AkeneoAPI;
