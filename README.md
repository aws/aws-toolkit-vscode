# AWS Toolkit for Visual Studio Code

[![TravisCI Build Status - develop branch](https://travis-ci.org/aws/aws-toolkit-vscode.svg?branch=develop)](https://travis-ci.org/aws/aws-toolkit-vscode)
![CodeBuild Build Status - develop branch](https://codebuild.us-west-2.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiMlluaDRTMnZLdmMvcFREQVQ4RjFoK0FUSTZPdlRVcWJlQ2gwRElLT2gxZDhMeno5MThZZnlXdURDVFFjOWdqSEQ5QjVBYm0xSURoU3E1RTVHejltcnZrPSIsIml2UGFyYW1ldGVyU3BlYyI6IkY3SE9CaG1oMHhJUmsyakkiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=develop)
[![Coverage](https://img.shields.io/codecov/c/github/aws/aws-toolkit-vscode/develop.svg)](https://codecov.io/gh/aws/aws-toolkit-vscode/branch/develop)

The AWS Toolkit for Visual Studio Code is an extension for working with AWS services such as AWS Lambda.

The toolkit is in preview and only available if built from source. This is pre-release software and we recommend against using it in a production environment.

This is an open source project because we want you to be involved. We love issues, feature requests, code reviews, pull requests or any positive contribution.

## Getting Started

### Install the toolkit

The toolkit has not been released to the marketplace, so in order to try it you must build and run from source:

> Note: [`git`](https://git-scm.com/downloads) and [`npm`](https://nodejs.org/) are required to build from source.

1. Clone the repository

```shell
git clone https://github.com/aws/aws-toolkit-vscode.git
cd aws-toolkit-vscode
```

2. Build and package the toolkit

```shell
npm install
npm run package
```

3. Install the toolkit

```shell
code --install-extension aws-toolkit-vscode-<VERSION>.vsix
```

### Sign in to your AWS account

#### Create a profile

##### Method One: Create a profile using the AWS CLI

1. If you haven't already, sign up for AWS. You can create a free account [here](https://aws.amazon.com/free/).
2. Install the AWS CLI by following the instructions [here](https://aws.amazon.com/cli/).
3. Run the command `aws configure`, and follow the instructions in the command prompt.

##### Method Two: Create a profile using the AWS Tools for PowerShell

1. If you haven't already, sign up for AWS. You can create a free account [here](https://aws.amazon.com/free/).
2. Install the AWS Tools for PowerShell by following the instructions [here](https://aws.amazon.com/powershell/).
3. Run the command `Set-AWSCredential -AccessKey [access-key-value] -SecretKey [secret-key-value] -StoreAs [profile-name]`.

##### Method Three: Manually create a profile

1. If you haven't already, sign up for AWS. You can create a free account [here](https://aws.amazon.com/free/).
2. Manually configure your configuration and credentials files as described [here](https://docs.aws.amazon.com/cli/latest/userguide/cli-config-files.html).

#### Select your profile in Visual Studio Code

1. Launch Visual Studio Code.
2. Select `View > Command Palette...` and search for `AWS`.
3. Select `AWS: Connect to AWS`

![Search AWS](./docs/images/search_aws.png)

<!-- markdownlint-disable MD029 -->
4. Select the profile that you created earlier.
<!-- markdownlint-enable MD029 -->

![Select Profile](./docs/images/select_profile.png)


## Contributing

See [Contributing](./CONTRIBUTING.md).

## License

The **AWS Toolkit for Visual Studio Code** is distributed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).
