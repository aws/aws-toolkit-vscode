# AWS Toolkit for Visual Studio Code

![Build Status - develop branch](https://codebuild.us-west-2.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiMlluaDRTMnZLdmMvcFREQVQ4RjFoK0FUSTZPdlRVcWJlQ2gwRElLT2gxZDhMeno5MThZZnlXdURDVFFjOWdqSEQ5QjVBYm0xSURoU3E1RTVHejltcnZrPSIsIml2UGFyYW1ldGVyU3BlYyI6IkY3SE9CaG1oMHhJUmsyakkiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=develop)

The AWS Toolkit for Visual Studio Code is an extension for working with AWS services such as AWS Lambda.

The toolkit is in preview and only available if built from source. This is pre-release software and we recommend against using it in a production environment.

This is an open source project because we want you to be involved. We love issues, feature requests, code reviews, pull requests or any positive contribution.

## Getting Started

### Install the toolkit

1. If you haven't already, install [Visual Studio Code](https://code.visualstudio.com/).
2. Launch Visual Studio Code.
3. Select `View > Extensions` or click the `Extensions` button to open the Extensions pane.
4. Search the marketplace for 'AWS Toolkit for Visual Studio Code'.
5. Click the `Install` button by the toolkit in the search results. <!-- TODO: Add screenshot once the toolkit is published to the marketplace. -->
6. Once installation has finished, click the `Reload` button by the toolkit in the search results. <!-- TODO: Add screenshot once the toolkit is published to the marketplace. -->

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

![Search AWS][search-aws]

<!-- markdownlint-disable MD029 -->
4. Select the profile that you created earlier.
<!-- markdownlint-enable MD029 -->

![Select Profile][select-profile]

## Contributing

See [Contributing](./Contributing.md).

## License

The **AWS Toolkit for Visual Studio Code** is distributed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).

[search-aws]: ./docs/images/search_aws.png "Search AWS"
[select-profile]: ./docs/images/select_profile.png "Select Profile"
