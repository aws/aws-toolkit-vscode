# AWS Toolkit for Visual Studio Code

System | Status
---|---
Build ([develop](https://github.com/aws/aws-toolkit-vscode/tree/develop) branch)|[![TravisCI Build Status - develop branch](https://travis-ci.org/aws/aws-toolkit-vscode.svg?branch=develop)](https://travis-ci.org/aws/aws-toolkit-vscode) ![CodeBuild Build Status - develop branch](https://codebuild.us-west-2.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiMlluaDRTMnZLdmMvcFREQVQ4RjFoK0FUSTZPdlRVcWJlQ2gwRElLT2gxZDhMeno5MThZZnlXdURDVFFjOWdqSEQ5QjVBYm0xSURoU3E1RTVHejltcnZrPSIsIml2UGFyYW1ldGVyU3BlYyI6IkY3SE9CaG1oMHhJUmsyakkiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=develop) [![Coverage](https://img.shields.io/codecov/c/github/aws/aws-toolkit-vscode/develop.svg)](https://codecov.io/gh/aws/aws-toolkit-vscode/branch/develop)
Build ([master](https://github.com/aws/aws-toolkit-vscode/tree/master) branch)|[![TravisCI Build Status - master branch](https://travis-ci.org/aws/aws-toolkit-vscode.svg?branch=master)](https://travis-ci.org/aws/aws-toolkit-vscode) ![CodeBuild Build Status - master branch](https://codebuild.us-west-2.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiMlluaDRTMnZLdmMvcFREQVQ4RjFoK0FUSTZPdlRVcWJlQ2gwRElLT2gxZDhMeno5MThZZnlXdURDVFFjOWdqSEQ5QjVBYm0xSURoU3E1RTVHejltcnZrPSIsIml2UGFyYW1ldGVyU3BlYyI6IkY3SE9CaG1oMHhJUmsyakkiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=master) [![Coverage](https://img.shields.io/codecov/c/github/aws/aws-toolkit-vscode/master.svg)](https://codecov.io/gh/aws/aws-toolkit-vscode/branch/master)
[Marketplace](https://marketplace.visualstudio.com/items?itemName=AmazonWebServices.aws-toolkit-vscode)|[![Marketplace Version](https://img.shields.io/vscode-marketplace/v/AmazonWebServices.aws-toolkit-vscode.svg) ![Marketplace Downloads](https://img.shields.io/vscode-marketplace/d/AmazonWebServices.aws-toolkit-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=AmazonWebServices.aws-toolkit-vscode)

The AWS Toolkit for Visual Studio Code is an extension for working with AWS services such as AWS Lambda.

The toolkit is in developer preview and is available from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/itemdetails?itemName=AmazonWebServices.aws-toolkit-vscode). This is pre-release software and we recommend against using it in a production environment.

This is an open source project because we want you to be involved. We love issues, feature requests, code reviews, pull requests or any positive contribution.

## User Guide

The [User Guide](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/welcome.html) contains instructions for getting up and running with the toolkit.

## Debugging from the Debug panel

CodeLenses appear above Serverless Application Lambda Functions, allowing you to locally debug the Function. If you would like [more control](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations) over the debugging experience, the following links can help you set up debug configurations for your project.

* [Debugging NodeJS Lambda Functions](docs/debugging-nodejs-lambda-functions.md)
* [Debugging Python Lambda Functions](docs/debugging-python-lambda-functions.md)
<!-- TODO: Uncomment once the PR for this doc is merged -->
<!-- * [Debugging .NET Core Lambda Functions](docs/debugging-dotnetcore-lambda-functions.md) -->

## Contributing

See [Contributing](./CONTRIBUTING.md).

## License

The **AWS Toolkit for Visual Studio Code** is distributed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).
