const {
  AKENEO_ENDPOINT,
  AKENEO_USER,
  AKENEO_PASSWORD,
  AKENEO_CLIENT_ID,
  AKENEO_CLIENT_SECRET,
} = process.env;

import fetch from "node-fetch";

const authenticate = async function authenticate({
  user,
  password,
  clientId,
  secret,
}) {
  const headers = {
    Authorization: `Basic ${Buffer.from(
      `${AKENEO_CLIENT_ID}:${AKENEO_CLIENT_SECRET}`
    ).toString("base64")}`,
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({
    grant_type: "password",
    username: AKENEO_USER,
    password: AKENEO_PASSWORD,
  });
  const result = await fetch(`${AKENEO_ENDPOINT}/api/oauth/v1/token`, {
    method: "POST",
    headers,
    body,
  });
  const { access_token } = await result.json();
  return access_token;
};

const AkeneoAPI = function AkeneoAPI() {
  const tokenPromise = authenticate({
    user: AKENEO_USER,
    password: AKENEO_PASSWORD,
    clientId: AKENEO_CLIENT_ID,
    secret: AKENEO_CLIENT_SECRET,
  });

  const akeneoFetch = async (path, params, options) => {
    const token = await tokenPromise;
    const url = new URL(`${AKENEO_ENDPOINT}${path}`);
    Object.keys(params).forEach((key) =>
      url.searchParams.append(key, params[key])
    );
    const result = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...options?.headers,
      },
    });
    if (result.statusCode !== 200) {
      throw new Error(
        `Akeneo failed to fetch ${url} with Error ${result.statusText}`
      );
    }
    return result.json();
  };

  return {
    async getProducts({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/products", {
        limit: 100,
        search: { updated: referenceDate },
      });
    },
    async getProductModels({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/product-models", {
        limit: 100,
        search: { updated: referenceDate },
      });
    },
    async getProductMedia({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/media-files", {
        limit: 100,
        search: { updated: referenceDate },
      });
    },
    async getAttributes({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/attributes", {
        limit: 100,
        search: { updated: referenceDate },
      });
    },
    async getAttributeOptions({
      search: { updated: referenceDate },
      attributeCode,
    }) {
      return akeneoFetch(`/api/rest/v1/attributes/${attributeCode}/options`, {
        limit: 100,
        search: { updated: referenceDate },
      });
    },
    async getAssociationTypes({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/association-types", {
        limit: 100,
        search: { updated: referenceDate },
      });
    },
    async getCategories({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/cartegories", {
        limit: 100,
        search: { updated: referenceDate },
      });
    },
    async getChannels({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/channels", {
        limit: 100,
        search: { updated: referenceDate },
      });
    },
    async getLocales({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/locales", {
        limit: 100,
        search: { updated: referenceDate },
      });
    },
    async getCurrencies({ referenceDate }) {
      return akeneoFetch("/api/rest/v1/currencies", {
        limit: 100,
        search: { updated: referenceDate },
      });
    },
  };
};

export default AkeneoAPI;
