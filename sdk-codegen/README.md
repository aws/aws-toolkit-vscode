# SDK Code Generation

This module automatically generates AWS SDK Clients based off service modules,
leveraging the [`software.amazon.awssdk:codegen`](https://mvnrepository.com/artifact/software.amazon.awssdk/codegen-maven-plugin) module
vended as part of the [AWS SDK for Java v2](https://github.com/aws/aws-sdk-java-v2).

This is used primarily for our custom Telemetry system which is not a public AWS Service (and thus does not have an SDK published to Maven).

The other use-case for this is working on as yet unreleased AWS Services (or unreleased changes to existing services).

## Usage
To generate a new service client, create a new directory in the `codegen-resources` directory and add the following model files:
* `service-2.json` - [required] this is the main service API model
* `customization.config` - [optional] determines any overrides necessary to generate the SDK
* `waiters-2.json` - [optional] used to generate SDK waiter configuration (see [here](https://aws.amazon.com/blogs/developer/using-waiters-in-the-aws-sdk-for-java-2-x/))
* `paginators-1.json` - [optional] used to generate SDK paginated operations (see [here](https://aws.amazon.com/blogs/developer/auto-pagination-feature-in-java-sdk-2-0/))

To test the new models generate the desired SDK clients run:

```
./gradlew generateSdk
```
