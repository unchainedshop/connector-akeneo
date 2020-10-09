const { UNCHAINED_ENDPOINT, UNCHAINED_EMAIL, UNCHAINED_PASSWORD } = process.env;

import fetch from "node-fetch";

const authenticate = async function authenticate({ email, password }) {
  const headers = {
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({
    operationName: "login",
    variables: { email, password },
    query:
      "mutation login($email: String!, $password: String) {\n  loginWithPassword(email: $email, plainPassword: $password) {\n    token\n  }\n}\n",
  });
  const result = await fetch(`${UNCHAINED_ENDPOINT}/graphql`, {
    method: "POST",
    headers,
    body,
  });
  const { data } = await result.json();
  return data?.loginWithPassword?.token;
};

const UnchainedAPI = function UnchainedAPI() {
  const tokenPromise = authenticate({
    email: UNCHAINED_EMAIL,
    password: UNCHAINED_PASSWORD,
  });

  return {
    async getToken() {
      return tokenPromise;
    },
    async fetch(path, params, options) {
      const token = await this.getToken();
      const url = new URL(`${UNCHAINED_ENDPOINT}${path}`);
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
    async submitEvents(events) {
      return this.fetch(
        "/bulk-import",
        {},
        {
          method: "POST",
          body: JSON.stringify({ events }),
        }
      );
    },
  };
};

export default UnchainedAPI;
