# _1.2_ (2019-03-26)
- **(Breaking Change)** Minimum SAM CLI version has been increased to 0.14.1
- **(Feature)** You can now specify a docker network when locally running a Lambda
- **(Feature)** You can now specify if SAM should skip checking for newer docker images when invoking local Lambda functions
- **(Feature)** Add Gradle based SAM project template
- **(Feature)** Java8 functions using `sam build` can now be deployed
- **(Feature)** Building of Python based Lambda functions has been migrated to using `sam build`. This adds the option to use a container-based build during local run/debug of Lambda functions.
- **(Feature)** The AWS CLI config and credential files are now monitored for changes. Changes automatically take effect.
- **(Feature)** Enable support for IntelliJ/Pycharm 2019.1
- **(Feature)** Add option to use a container-based build during serverless application deployment
- **(Feature)** Enable support for running, debugging, and deploying Python 3.7 lambdas
- **(Feature)** Building of Java 8 based Lambda functions has been migrated to using `sam build` (Maven and Gradle are supported).
- **(Bug Fix)** Fix sort order for CloudFormation nodes in the AWS Explorer
- **(Bug Fix)** Clarify validation error when SAM CLI is too old
- **(Bug Fix)** Fix issue where 'Edit Credentials' action didn't check for both 'config' and 'credentials'
- **(Bug Fix)** Fix issue where the cancel button in the Serverless Deploy progress dialog did nothing
- **(Bug Fix)** Improve 'Invalid AWS Credentials' messaging to include error details
- **(Bug Fix)** Unable to edit AWS credential file via pycharm ([#759](https://github.com/aws/aws-toolkit-jetbrains/issues/759))
- **(Bug Fix)** Fix issue where invalid AWS Credentials prevent plugin startup
- **(Bug Fix)** Require SAM run configurations to have an associated credential profile ([#526](https://github.com/aws/aws-toolkit-jetbrains/issues/526))

# _1.1_ (2019-01-08)
- **(Feature)** Additional information provided when AWS Explorer isn't able to load data - [#634](https://github.com/aws/aws-toolkit-jetbrains/issues/634) [#578](https://github.com/aws/aws-toolkit-jetbrains/issues/578)
- **(Feature)** Able to view CloudFormation stack details by double clicking it in the Explorer
- **(Feature)** Added AWS Credential validation when changing profiles
- **(Bug Fix)** Fix case where packaging Java code was not releasing file locks [#694](https://github.com/aws/aws-toolkit-jetbrains/issues/694)
- **(Bug Fix)** Suppress FileNotFoundException that can be thrown if the endpoints file fails to download
- **(Bug Fix)** Fixed issue where accounts without Lambda access were unable to open CloudFormation stack nodes
- **(Bug Fix)** Use us-east-1 instead of global endpoint for STS
- **(Bug Fix)** Ignore .DS_Store files when building Lambda zip ([#725](https://github.com/aws/aws-toolkit-jetbrains/issues/725))
- **(Bug Fix)** Fix IllegalStateException: context.module must not be null ([#643](https://github.com/aws/aws-toolkit-jetbrains/issues/643))
- **(Bug Fix)** Fixed issue on OS X where the SAM CLI is unable to use an UTF-8 locale.
- **(Bug Fix)** Fix the status message for certain states during CloudFormation stack updates ([#702](https://github.com/aws/aws-toolkit-jetbrains/issues/702))

