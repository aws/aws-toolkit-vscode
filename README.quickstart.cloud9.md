# <a id="top"></a>AWS Toolkit

AWS Toolkit is an extension for AWS Cloud9 that enables you to interact with [Amazon Web Services (AWS)](https://aws.amazon.com/what-is-aws/).
See the [AWS Toolkit user guide](https://docs.aws.amazon.com/cloud9/latest/user-guide/toolkit-welcome.html) for complete documentation.

See [Get help](#get-help) for support.

# <a id="features"></a>Features

-   [AWS Explorer](#ui-components-aws-expl)
    -   API Gateway
    -   CloudFormation stacks
    -   ECR
    -   Lambda functions
    -   S3 explorer
-   [AWS Serverless Applications (SAM)](#sam-and-lambda)
-   [`AWS:` Commands](#aws-commands)

---

## <a id="ui-components-aws-expl"></a>AWS Explorer

The **AWS Explorer** provides access to the AWS services that you can work with when using the Toolkit. To see the **AWS Explorer**, choose the **AWS** icon in the **Activity bar**.

## ![Overview, AWS Explorer](./resources/marketplace/cloud9/overview-aws-explorer-en.png)

## <a id="sam-and-lambda"></a> AWS Serverless Applications

The AWS Toolkit enables you to develop [AWS serverless applications](https://aws.amazon.com/serverless/) locally. It also provides _Inline Actions_ in Cloud9 to do the following:

-   Use SAM (serverless application model) templates to build and debug your locally developed AWS serverless applications.
-   Run selected [AWS Lambda](https://aws.amazon.com/lambda/) functions.

To start debugging with a SAM template, click the `Add Debug Configuration` _Inline Action_ in the template file.

![Add Debug Configuration Template](./resources/marketplace/cloud9/Codelens-YAML-template.png)

###### The _Inline Action_ indicator in the SAM template allows you to add a debug configuration for the serverless application.</h6>

Alternatively, you can run and debug just the AWS Lambda function and exclude other resources defined by the SAM template. Again, use an _Inline Action_ indicator for an AWS Lambda-function handler. (A _handler_ is a function that Lambda calls to start execution of a Lambda function.)

![Add Debug Configuration Direct](./resources/marketplace/cloud9/Codelens-direct-function.png)

###### The _Inline Action_ indicator in the application file lets you add a debug configuration for a selected AWS Lambda function.

When you run a debug session, the status and results are shown in the **AWS Toolkit** output channel. If the toolkit does not have an open **AWS Toolkit** output channel, one can be created with the New Tab button.

![Configure and Run](./resources/marketplace/cloud9/sam-configure-and-run-still-en.png)

###### After a local run is complete, the output appears in the **OUTPUT** tab.

When you're satisfied with performance, you can [deploy your serverless application](https://docs.aws.amazon.com/cloud9/latest/user-guide/deploy-serverless-app.html). The SAM template is converted to a CloudFormation template, which is then used to deploy all the application's assets to the AWS Cloud.

### Supported runtimes

The Toolkit _local SAM debugging_ feature supports these runtimes:

-   JavaScript (Node.js 10.x, 12.x, 14.x)
-   Python (3.7, 3.8)

For more information see [Working with AWS Serverless Applications](https://docs.aws.amazon.com/cloud9/latest/user-guide/serverless-apps-toolkit.html) in the user guide.

{ [Return to Top](#top) }

---

## <a id="aws-commands"></a>`AWS:` Commands

The Toolkit provides commands (prefixed with `AWS:`) to the AWS Cloud9 _Go to Anything panel_, available by clicking the search bar and typing "." or via hotkey.

| OS      | Hotkey   |
| :------ | :------- |
| Windows | `CTRL-.` |
| macOS   | `CMD-.`  |

![Go to Anything panel](./resources/marketplace/cloud9/open-commands-en.png)

| AWS Command                             | Description                                                                                                                                                                                                                                |
| :-------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AWS: About Toolkit`                    | Displays information about the AWS Toolkit.                                                                                                                                                                                                |
| `AWS: Add SAM Debug Configuration`      | Creates an `aws-sam` Debug Configuration from a function in the given source file                                                                                                                                                          |
| `AWS: Connect to AWS`                   | Connects the Toolkit to an AWS account.                                                                                                                                                                                                    |
| `AWS: Create a new Issue on Github`     | Opens the AWS Toolkit's [New Issue page on Github](https://github.com/aws/aws-toolkit-vscode/issues/new/choose).                                                                                                                           |
| `AWS: Create Credentials Profile`       | Creates an AWS credentials profile.                                                                                                                                                                                                        |
| `AWS: Create Lambda SAM Application`    | Generates code files for a new AWS serverless Lambda application. For more information, see [Creating a Serverless Application](https://docs.aws.amazon.com/cloud9/latest/user-guide/latest/user-guide/create-sam.html) in the user guide. |
| `AWS: Deploy SAM Application`           | Deploys a local serverless application to an AWS account. For more information, see [Deploying a Serverless Application](https://docs.aws.amazon.com/cloud9/latest/user-guide/deploy-serverless-app.html) in the user guide.               |
| `AWS: Detect SAM CLI`                   | Checks whether the Toolkit can communicate correctly with the AWS SAM CLI that is installed.                                                                                                                                               |
| `AWS: Hide region from the Explorer`    | Hides an AWS Region from the **AWS Explorer**.                                                                                                                                                                                             |
| `AWS: Show region in the Explorer`      | Displays an AWS Region in the **AWS Explorer**.                                                                                                                                                                                            |
| `AWS: Sign out`                         | Disconnects the Toolkit from the currently-connected AWS account.                                                                                                                                                                          |
| `AWS: Submit Quick Feedback...`         | Submit a private, one-way message and sentiment to the AWS Toolkit dev team. For larger issues that warrant conversations or bugfixes, please submit an issue in Github with the **AWS: Create a New Issue on Github** command.            |
| `AWS: Toggle SAM hints in source files` | Toggles AWS SAM-related Inline Actions in source files                                                                                                                                                                                     |
| `AWS: View Toolkit Logs`                | Displays log files that contain general Toolkit diagnostic information.                                                                                                                                                                    |
| `AWS: View Quick Start`                 | Open this quick-start guide.                                                                                                                                                                                                               |
| `AWS: View Toolkit Documentation`       | Opens the [user guide](https://docs.aws.amazon.com/cloud9/latest/user-guide/toolkit-welcome.html) for the Toolkit.                                                                                                                         |
| `AWS: View Source on GitHub`            | Opens the [GitHub repository](https://github.com/aws/aws-toolkit-vscode) for the Toolkit.                                                                                                                                                  |

{ [Return to Top](#top) }

---

# <a id="get-help"></a>Get help

For additional details on how to use the AWS Toolkit, see the [user guide](https://docs.aws.amazon.com/cloud9/latest/user-guide/toolkit-welcome.html).

To report issues with the Toolkit or to propose Toolkit code changes, see the [aws/aws-toolkit-vscode](https://github.com/aws/aws-toolkit-vscode) repository on GitHub.

You can also [contact AWS](https://aws.amazon.com/contact-us/) directly.

{ [Return to Top](#top) }
