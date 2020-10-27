import * as AWS from "aws-sdk";

export async function fetchConfig() {
  const secretName = process.env.SECRET_CONFIG_KEY;
  if (!secretName) {
    console.warn(`SECRET_CONFIG_KEY not set, returning empty config value`);
    return {};
  }

  console.log("Fetching secret...");
  let ssmClient = new AWS.SSM();
  let parameterRes = (
    await ssmClient
      .getParameter({
        Name: secretName,
        WithDecryption: true,
      })
      .promise()
  ).Parameter.Value;

  console.log("Secret retrieved");
  let decodedSecret = JSON.parse(parameterRes);
  return decodedSecret;
}
