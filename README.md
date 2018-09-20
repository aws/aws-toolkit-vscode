# AWS Toolkit for Visual Studio Code

The AWS Toolkit for Visual Studio Code is an extension for working with AWS services such as AWS Lambda.

## Getting Started

### Install the toolkit

1. If you haven't already, install [Visual Studio Code](https://code.visualstudio.com/).
2. Launch Visual Studio Code.
3. Select `View > Extensions` or click the `Extensions` button to open the Extensions pane.

![Extensions Button][extensions-button]

<!-- markdownlint-disable MD029 -->

4. Search the marketplace for 'AWS Toolkit for Visual Studio Code'.
5. Click the `Install` button by the toolkit in the search results. <!-- TODO: Add screenshot once the toolkit is published to the marketplace. -->
6. Once installation has finished, click the `Reload` button by the toolkit in the search results. <!-- TODO: Add screenshot once the toolkit is published to the marketplace. -->

<!-- markdownlint-enable MD029 -->

### Sign in to your AWS account

#### Create a profile

##### Method One: Create a profile using the AWS CLI

1. If you haven't already, sign up for AWS. You can create a free account [here](https://aws.amazon.com/free/).
2. Install the AWS CLI by following the instructions [here](https://aws.amazon.com/cli/).
3. Run the command `aws configure`, and follow the instructions in the command prompt.

##### Method Two: Manually create a profile

1. If you haven't already, sign up for AWS. You can create a free account [here](https://aws.amazon.com/free/).
2. Find your AWS Acces Key and Secret Access Key by following the instructions [here](https://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html#access-keys-and-secret-access-keys).
3. Create a file called `~/.aws/credentials` with the following content:

```config
[default]
aws_access_key_id = <your access key id>
aws_secret_access_key = <your secret access key id>
```

* Replace `<your access key id>` with your access key id.
* Replace `<your secret access key id>` with your secret access key id.

<!-- markdownlint-disable MD029 -->
4. Create a file called `~/.aws/config` with the following content.:
<!-- markdownlint-enable MD029 -->

```config
[my-profile-name]
region = my-default-region
```

* Replace `my-profile-name` with a name for your profile, i.e. `default`.
* Replace `my-default-region` with a region name, i.e. `us-east-1`.

#### Select your profile in Visual Studio Code

1. Launch Visual Studio Code.
2. Select `View > Command Palette...` and search for `AWS`.
3. Select `AWS: Sign in`

![Search AWS][search-aws]

<!-- markdownlint-disable MD029 -->
4. Select the profile that you created earlier.
<!-- markdownlint-enable MD029 -->

![Select Profile][select-profile]

## Highlighted Features

### Lambda Explorer

TODO: Expand this section with details and screenshots once the feature is complete.

### Create a new Lambda Function

TODO: Expand this section with details and screenshots once the feature is complete.

### Deploy a Lambda Function to AWS

TODO: Expand this section with details and screenshots once the feature is complete.

### Debug a Lambda Function locally

TODO: Expand this section with details and screenshots once the feature is complete.

## Contributing

See [Contributing](./Contributing.md).

## License

The **AWS Toolkit for Visual Studio Code** is distributed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).

<!--
TODO: Once it is public that we're working on a VS Code extension, file an issue against Microsoft/vscode:
Title: `extensions/extension-editing/src/extensionLinter.ts` does not respect `repository` shorthand in `package.json`.
Description:
VS Code warns about non-http relative image links in markdown files, with this message:

> Relative image URLs require a repository with HTTPS protocol to be specified in the package.json.

If I update package.json to include a repository with an HTTPS URL, this warning goes away:

    "repository": {
        "type": "git",
        "url": "https://github.com/user/repo"
    }

However, there are [other ways](https://docs.npmjs.com/files/package.json#repository) to specify a repository url. For example:

    "repository": "github:user/repo"

In this case, the "repository" link will point to `https://github.com/user/repo`. But the extension-linter does not detect this case, and still shows the warning.
-->

[extensions-button]: ./documentation/images/extensions_button.png "Extensions Button"
[search-aws]: ./documentation/images/search_aws.png "Search AWS"
[select-profile]: ./documentation/images/select_profile.png "Select Profile"
