![Build Status](https://codebuild.eu-west-1.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiekhxeERIMmNLSkNYUktnUFJzUVJucmJqWnFLMGlpNXJiNE1LLzVWV3B1QUpSSkhCS04veHZmUGxZZ0ZmZlRzYjJ3T1VtVEs1b3JxbWNVOHFOeFJDOTAwPSIsIml2UGFyYW1ldGVyU3BlYyI6ImZXNW5KaytDRGNLdjZuZDgiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=master) 
[![Coverage](https://img.shields.io/codecov/c/github/aws/aws-toolkit-jetbrains/master.svg)](https://codecov.io/gh/aws/aws-toolkit-jetbrains/branch/master) 
[![Downloads](https://img.shields.io/jetbrains/plugin/d/11349-aws-toolkit.svg)](https://plugins.jetbrains.com/plugin/11349-aws-toolkit) 
[![Version](https://img.shields.io/jetbrains/plugin/v/11349.svg?label=version)](https://plugins.jetbrains.com/plugin/11349-aws-toolkit)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=aws_aws-toolkit-jetbrains&metric=alert_status)](https://sonarcloud.io/dashboard?id=aws_aws-toolkit-jetbrains)
 
# AWS Toolkit for JetBrains

AWS Toolkit for JetBrains is a plugin for JetBrains IDEs that 
make it easier to write applications built on [Amazon Web Services](https://aws.amazon.com/)

The AWS Toolkit for JetBrains is open source because we want you to be involved. We appreciate issues, feature requests, pull 
requests, code reviews or any other contributions.

## Feedback

We want your feedback!

- Vote on [feature requests](https://github.com/aws/aws-toolkit-jetbrains/issues?q=is%3Aissue+is%3Aopen+label%3Afeature-request+sort%3Areactions-%2B1-desc). Votes help us drive prioritization of features 
- [Request a new feature](https://github.com/aws/aws-toolkit-jetbrains/issues/new?labels=feature-request&template=feature_request.md)
- [Ask a question](https://github.com/aws/aws-toolkit-jetbrains/issues/new?labels=guidance&template=guidance_request.md)
- [File an issue](https://github.com/aws/aws-toolkit-jetbrains/issues/new?labels=bug&template=bug_report.md)
- Code contributions. See [our contributing guide](CONTRIBUTING.md) for how to get started.

## Supported IDEs
All JetBrains IDEs 2023.2+

## Installation

See [Installing the AWS Toolkit for JetBrains](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/install) in the AWS Toolkit for JetBrains User Guide.

To use this AWS Toolkit, you will first need an AWS account, a user within that account, and an access key for that 
user. To use the AWS Toolkit to do AWS serverless application development and to run/debug AWS Lambda functions locally,
you will also need to install the AWS CLI, Docker, and the AWS SAM CLI. The installation guide covers setting up all of 
these prerequisites.

### EAP Builds
We also offer opt-in Early Access Preview builds that are built automatically.

In order to opt-in:
* Add the URL `https://plugins.jetbrains.com/plugins/eap/aws.toolkit` to your IDE's plugin repository preferences by 
going to **Plugins->Gear Icon->Manage Plugin Repositories** and adding the URL to the list
* Check for updates.

### Installing From Source
Please see [CONTRIBUTING](CONTRIBUTING.md#building-from-source) for instructions.

## Features

### General

* **AWS Resource Explorer** - tree-view of AWS resources available in your 
selected account/region. This does not represent all resources available in your account, only a sub-set of those 
resource types supported by the plugin.
[Learn More](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/aws-explorer)
* **Authentication** - Connect to AWS using static credentials, credential process, AWS Builder ID or AWS SSO. [Learn more about
authentication options](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/credentials)

### Services

#### ![CloudFormation][cloudformation-icon] AWS CloudFormation
* View events, resources, and outputs for your CloudFormation stacks
#### ![CloudWatch Logs][cloudwatch-logs-icon] CloudWatch Logs 
* View and search your CloudWatch log streams
#### ![AWS Lambda][lambda-icon] AWS Lambda

Many of these features require the [AWS SAM CLI](https://github.com/awslabs/aws-sam-cli) to be installed, see the 
Serverless Application Model ([SAM](https://aws.amazon.com/serverless/sam/)) website for more information on 
installation of the SAM CLI.

**SAM features support Java, Python, Node.js, and .NET Core**

* **Run/Debug Local Lambda Functions** - Locally test and step-through debug functions in a Lambda-like execution 
environment provided by the SAM CLI.
[Learn More](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/lambda-local)
* **Invoke Remote Lambda Functions** - Invoke remote functions using a sharable run-configuration
[Learn More](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/lambda-remote)
* **Package & Deploy Lambda Functions** - Ability to package a Lambda function zip and create a remote lambda
[Learn More](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/lambda-deploy)
* **Sync SAM-based Applications** - Sync & track SAM-based applications
[Learn More](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/sam-deploy)

*Note: Python features are available in both PyCharm and IntelliJ with the 
[Python Plugin](https://www.jetbrains.com/help/idea/plugin-overview.html) installed.*

#### ![Amazon Redshift][redshift-icon] Amazon RDS/Redshift
* Connect to RDS/Redshift databases using temporary credentials with IAM/SecretsManager, no copy paste required

*Note: database features require using a paid JetBrains product*
#### ![Amazon S3][s3-icon] Amazon S3
* View and manage your S3 buckets
* Upload/Download to from buckets
* [Learn more](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/s3-tasks)

### Experimental Features

Sometimes we'll introduce experimental features that we're trying out. These may have bugs, usability problems or may not be fully functional, and because these
aren't ready for prime-time we'll hide them behind an experimental feature flag. 

Experimental features can be enabled in the settings/preferences
(`Settings -> Tools -> AWS -> Experimental Features`) or via the Addtional Settings (![Gear Icon][gear-icon]) in the AWS Explorer Tool Window. 

Please note that experimental features may be disabled / removed at any time.

## Licensing

The plugin is distributed according to the terms outlined in our [LICENSE](LICENSE).

[lambda-icon]: plugins/core/jetbrains-community/resources/icons/resources/LambdaFunction.svg
[s3-icon]: plugins/core/jetbrains-community/resources/icons/resources/S3Bucket.svg
[cloudwatch-logs-icon]: plugins/core/jetbrains-community/resources/icons/resources/cloudwatchlogs/CloudWatchLogs.svg
[cloudformation-icon]: plugins/core/jetbrains-community/resources/icons/resources/CloudFormationStack.svg
[redshift-icon]: plugins/core/jetbrains-community/resources/icons/resources/Redshift.svg
[find-action]: https://www.jetbrains.com/help/idea/searching-everywhere.html#search_actions
[gear-icon]: https://raw.githubusercontent.com/JetBrains/intellij-community/master/platform/icons/src/general/gear.svg
