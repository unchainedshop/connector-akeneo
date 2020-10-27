# Usage with https://www.serverless.com/ and AWS Lambda

## Configuration

* Install `serverless` by running:
> npm install serverless serverless-webpack webpack --save-dev
* Setup Webpack
```
const slsw = require("serverless-webpack");

module.exports = {
  entry: slsw.lib.entries,
  mode: "development",
  target: "node",
};
```
* Set-up your AWS CLI (for Mac OS - https://awscli.amazonaws.com/AWSCLIV2.pkg) and make sure you have your account configured `~/.aws/credentials`. Current configuration expects that you have an AWS profile named `gmb` - this profile will be used to deploy to AWS
* Since we're using ES modules, we're relying on Webpack to bundle our deployment artifact, so please make sure webpack is installed and also install serverless-webpack plugin:
* Double-check the correctness of environment variables in `serverless.yaml` under `environment` tag
* Cron job schedule is set in `serverless.yaml` below `schedule` tag

## Deploy

### Pack
In case you just want to check the contents of the artifact (available in `.serverless` directory), run:
> $ npx serverless package

### Run locally
Execute:
> $ npx serverless invoke local --function akeneo-unchained-connector

### Deploy to AWS Lambda
> $ npx serverless deploy


# Usage with Swarm Cronjob

https://crazymax.dev/swarm-cronjob/
