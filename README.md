![Build Status](https://codebuild.eu-west-1.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiekhxeERIMmNLSkNYUktnUFJzUVJucmJqWnFLMGlpNXJiNE1LLzVWV3B1QUpSSkhCS04veHZmUGxZZ0ZmZlRzYjJ3T1VtVEs1b3JxbWNVOHFOeFJDOTAwPSIsIml2UGFyYW1ldGVyU3BlYyI6ImZXNW5KaytDRGNLdjZuZDgiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=master) 
[![Coverage](https://img.shields.io/codecov/c/github/aws/aws-toolkit-jetbrains/master.svg)](https://codecov.io/gh/aws/aws-toolkit-jetbrains/branch/master) 
[![Gitter](https://badges.gitter.im/aws/aws-toolkit-jetbrains.svg)](https://gitter.im/aws/aws-toolkit-jetbrains?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)
[![Downloads](https://img.shields.io/jetbrains/plugin/d/11349-aws-toolkit.svg)](https://plugins.jetbrains.com/plugin/11349-aws-toolkit) 
[![Version](https://img.shields.io/jetbrains/plugin/v/11349.svg?label=version)](https://plugins.jetbrains.com/plugin/11349-aws-toolkit)
 
# AWS Toolkit for JetBrains

AWS Toolkit for JetBrains - a plugin for interacting with AWS from JetBrains IDEs. The plugin includes features that 
make it easier to write applications on [Amazon Web Services](https://aws.amazon.com/) using a JetBrains IDE.

This is an open source project because we want you to be involved. We love issues, feature requests, code reviews, pull 
requests or any positive contribution. Please see the the [CONTRIBUTING](CONTRIBUTING.md) guide for how to help.  

## Requirements
Supported IDEs:
* IntelliJ Community/Ultimate 2019.2+
* PyCharm Community/Professional 2019.2+
* Rider 2019.2+
* WebStorm 2019.2+

## Installation

See [Installing the AWS Toolkit for JetBrains](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/install) in the AWS Toolkit for JetBrains User Guide.

To use this AWS Toolkit, you will first need an AWS account, a user within that account, and an access key for that 
user. To use the AWS Toolkit to do AWS serverless application development and to run/debug AWS Lambda functions locally,
you will also need to install the AWS CLI, Docker, and the AWS SAM CLI. The preceding link covers setting up all of 
these prerequisites.

### EAP Builds
We also offer opt-in Early Access Preview builds that are built automatically.

In order to opt-in:
* Add the URL `https://plugins.jetbrains.com/plugins/eap/aws.toolkit` to your IDE's plugin repository preferences by 
going to **Plugins->Gear Icon->Manage Plugin Repositories** and adding the URL to the list
* Check for updates.

### From Source
Please see [CONTRIBUTING](CONTRIBUTING.md#building-from-source) for instructions.

## Features

### General

Features that don't relate to a specific AWS service.

* **Credential management** - the ability to select how you want to authenticate with AWS, management of several 
credential types and the ability to easily switch between profiles. 
[Learn More](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/credentials)
* **Region management** - the ability to switch between viewing resources in different AWS regions.
[Learn More](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/regions)
* **AWS Resource Explorer** - tree-view of AWS resources available in your 
selected account/region. This does not represent all resources available in your account, only a sub-set of those 
resource types supported by the plugin.
[Learn More](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/aws-explorer)

### Services

#### ![AWS Lambda][lambda-icon] AWS Lambda

Many of these features require the [AWS SAM CLI](https://github.com/awslabs/aws-sam-cli) to be installed, see the 
Serverless Application Model ([SAM](https://aws.amazon.com/serverless/sam/)) website for more information on 
installation of the SAM CLI.

**SAM features support Java, Python, Node.js, and .NET Core**

* **New Project Wizard** - Get started quickly by using one of the quickstart serverless application templates.
[Learn More](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/new-project)
* **Run/Debug Local Lambda Functions** - Locally test and step-through debug functions in a Lambda-like execution 
environment provided by the SAM CLI.
[Learn More](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/lambda-local)
* **Invoke Remote Lambda Functions** - Invoke remote functions using a sharable run-configuration
[Learn More](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/lambda-remote)
* **Package & Deploy Lambda Functions** - Ability to package a Lambda function zip and create a remote lambda
[Learn More](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/lambda-deploy)
* **Deploy SAM-based Applications** - Package, deploy & track SAM-based applications
[Learn More](https://docs.aws.amazon.com/console/toolkit-for-jetbrains/sam-deploy)

*NB: Python-only features are available in both PyCharm and IntelliJ with the 
[Python Plugin](https://www.jetbrains.com/help/idea/plugin-overview.html) installed.*

## Roadmap

The best view of our long-term road-map is by looking the upcoming Release 
[Milestones](https://github.com/aws/aws-toolkit-jetbrains/milestones). 

In addition to GitHub's built-in [Projects](https://github.com/aws/aws-toolkit-jetbrains/projects) and 
[Milestones](https://github.com/aws/aws-toolkit-jetbrains/milestones) we use [ZenHub](https://www.zenhub.com) to help:
* manage our back-log
* prioritize features
* estimate issues
* create sprint-boards

To enable these enhanced views can sign-up for ZenHub (using your GitHub account - it's free), install 
the ZenHub [extension](https://www.zenhub.com/extension) for your browser and then navigate to the 
[ZebHub](https://github.com/aws/aws-toolkit-jetbrains#zenhub) tab in the toolkit repository. 

## Licensing

The plugin is distributed according to the terms outlined in our [LICENSE](LICENSE).

[lambda-icon]: jetbrains-core/resources/icons/resources/LambdaFunction.svg
