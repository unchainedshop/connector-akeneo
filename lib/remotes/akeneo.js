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

  return {
    async getToken() {
      return tokenPromise;
    },
    async fetch(path, params, options) {
      const token = await this.getToken();
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
      return result.json();
    },
    async getProducts() {
      return this.fetch("/api/rest/v1/products", { limit: 100 });
    },
    async getProductModels() {
      return this.fetch("/api/rest/v1/product-models", { limit: 100 });
    },
    async getProductMedia() {
      return this.fetch("/api/rest/v1/media-files", { limit: 100 });
    },
    async getAttributes() {
      return this.fetch("/api/rest/v1/attributes", { limit: 100 });
    },
    async getAttributeOptions(attributeCode) {
      return this.fetch(`/api/rest/v1/attributes/${attributeCode}/options`, {
        limit: 100,
      });
    },
    async getAssociationTypes() {
      return this.fetch("/api/rest/v1/association-types", {
        limit: 100,
      });
    },
    async getCategories() {
      return this.fetch("/api/rest/v1/cartegories", {
        limit: 100,
      });
    },
    async getChannels() {
      return this.fetch("/api/rest/v1/channels", {
        limit: 100,
      });
    },
    async getLocales() {
      return this.fetch("/api/rest/v1/locales", {
        limit: 100,
      });
    },
    async getCurrencies() {
      return this.fetch("/api/rest/v1/currencies", {
        limit: 100,
      });
    },
  };
};

export default AkeneoAPI;
