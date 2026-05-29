const BASE_URL =
  "https://your-mock-api.com";

async function validateUser(credentials) {

  const response = await fetch(
    `${BASE_URL}/account-me`,
    {
      method: "GET",

      headers: {
        "provider-id":
          credentials.providerId,

        "provider-secret":
          credentials.providerSecret,

        "api-key":
          credentials.apiKey
      }
    }
  );

  return response.json();
}

async function fetchRecords(credentials) {

  const response = await fetch(
    `${BASE_URL}/records`,
    {
      method: "GET",

      headers: {
        "provider-id":
          credentials.providerId,

        "provider-secret":
          credentials.providerSecret,

        "api-key":
          credentials.apiKey
      }
    }
  );

  return response.json();
}