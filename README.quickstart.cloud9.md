# <a id="top"></a>AWS Toolkit

AWS Toolkit is an extension for AWS Cloud9 that enables you to interact with [Amazon Web Services (AWS)](https://aws.amazon.com/what-is-aws/).
See the [AWS Toolkit for Visual Studio Code user guide](https://docs.aws.amazon.com/console/toolkit-for-vscode/welcome) for complete documentation.

See [Setup](#additional-setup-steps) for installation requirements, or [Get help](#get-help) for support.

# <a id="features"></a>Features

-   [AWS Explorer](#ui-components-aws-expl)
    -   CloudFormation stacks
    -   Lambda functions
-   [AWS Serverless Applications (SAM)](#sam-and-lambda)
-   [`AWS:` Commands](#aws-commands)

---

## <a id="ui-components-aws-expl"></a>AWS Explorer

The **AWS Explorer** provides access to the AWS services that you can work with when using the Toolkit. To see the **AWS Explorer**, choose the **AWS** icon in the **Activity bar**.

TODO: screenshot

{ [Return to Top](#top) }

---

## <a id="sam-and-lambda"></a> AWS Serverless Applications

The AWS Toolkit enables you to develop [AWS serverless applications](https://aws.amazon.com/serverless/) locally. It also provides _CodeLenses_ in Cloud9 to do the following:

-   Use SAM (serverless application model) templates to build and debug your locally developed AWS serverless applications.
-   Run selected [AWS Lambda](https://aws.amazon.com/lambda/) functions.

To start debugging with a SAM template, click the `Add Debug Configuration` _CodeLens_ in the template file.

TODO: screenshot

###### The _CodeLens_ indicator in the SAM template allows you to add a debug configuration for the serverless application.</h6>

Alternatively, you can run and debug just the AWS Lambda function and exclude other resources defined by the SAM template. Again, use a _CodeLens_ indicator for an AWS Lambda-function handler. (A _handler_ is a function that Lambda calls to start execution of a Lambda function.)

TODO: screenshot

###### The _CodeLens_ indicator in the application file lets you add a debug configuration for a selected AWS Lambda function.

When you run a debug session, the status and results are shown in the **OUTPUT** panel when the **AWS Toolkit** output channel is selected.

TODO: screenshot

###### After a local run is complete, the output appears in the **OUTPUT** tab.

When you're satisfied with performance, you can [deploy your serverless application](https://docs.aws.amazon.com/console/toolkit-for-vscode/deploy-serverless-app). The SAM template is converted to a CloudFormation template, which is then used to deploy all the application's assets to the AWS Cloud.

### Launch config auto-completion ("IntelliSense")

The `Add Debug Configuration` _CodeLens_ creates launch configs of type
`aws-sam` in the VS Code `launch.json` file. You can also create these entries
by hand.

When editing `launch.json` configs, AWS Toolkit provides auto-completion and
contextual documentation, as shown below.

TODO: screenshot

### Supported runtimes

The Toolkit _local SAM debugging_ feature supports these runtimes:

-   JavaScript (Node.js 10.x, 12.x)
-   Python (2.7, 3.6, 3.7, 3.8)

For more information see [Working with AWS Serverless Applications](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/serverless-apps.html) in the user guide.

{ [Return to Top](#top) }

---

## <a id="aws-commands"></a>`AWS:` Commands

The Toolkit provides commands (prefixed with `AWS:`) to the VS Code _command
palette_, available by selecting _View > Command Palette_ or by typing
`CTRL-SHIFT-p` (macOS: `CMD-SHIFT-p`).

TODO: screenshot

| AWS Command                          | Description                                                                                                                                                                                                                     |
| :----------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AWS: About AWS Toolkit`             | Displays information about the AWS Toolkit.                                                                                                                                                                                     |
| `AWS: Connect to AWS`                | Connects the Toolkit to an AWS account. For more information, see [Connecting to AWS](https://docs.aws.amazon.com/console/toolkit-for-vscode/connect) in the user guide.                                                        |
| `AWS: Create a new Issue on Github`  | Opens the AWS Toolkit's [New Issue page on Github](https://github.com/aws/aws-toolkit-vscode/issues/new/choose).                                                                                                                |
| `AWS: Create Credentials Profile`    | Creates an AWS credentials profile. For more information, see [Setting Up Your AWS Credentials](https://docs.aws.amazon.com/console/toolkit-for-vscode/setup-credentials) in the user guide.                                    |
| `AWS: Create new SAM Application`    | Generates a set of code files for a new AWS serverless application. For more information, see [Creating a Serverless Application](https://docs.aws.amazon.com/console/toolkit-for-vscode/create-sam) in the user guide.         |
| `AWS: Deploy SAM Application`        | Deploys a local serverless application to an AWS account. For more information, see [Deploying a Serverless Application](https://docs.aws.amazon.com/console/toolkit-for-vscode/deploy-serverless-app) in the user guide.       |
| `AWS: Detect SAM CLI`                | Checks whether the Toolkit can communicate correctly with the AWS SAM CLI that is installed.                                                                                                                                    |
| `AWS: Hide region from the Explorer` | Hides an AWS Region from the **AWS Explorer**.                                                                                                                                                                                  |
| `AWS: Show region in the Explorer`   | Displays an AWS Region in the **AWS Explorer**.                                                                                                                                                                                 |
| `AWS: Sign out`                      | Disconnects the Toolkit from the currently-connected AWS account.                                                                                                                                                               |
| `AWS: Submit Quick Feedback...`      | Submit a private, one-way message and sentiment to the AWS Toolkit dev team. For larger issues that warrant conversations or bugfixes, please submit an issue in Github with the **AWS: Create a New Issue on Github** command. |
| `AWS: View AWS Toolkit Logs`         | Displays log files that contain general Toolkit diagnostic information.                                                                                                                                                         |
| `AWS: View Quick Start`              | Open this quick-start guide.                                                                                                                                                                                                    |
| `AWS: View Toolkit Documentation`    | Opens the [user guide](https://docs.aws.amazon.com/console/toolkit-for-vscode/welcome) for the Toolkit.                                                                                                                         |
| `AWS: View Source on GitHub`         | Opens the [GitHub repository](https://github.com/aws/aws-toolkit-vscode) for the Toolkit.                                                                                                                                       |

{ [Return to Top](#top) }

---

# <a id="additional-setup-steps"></a>Setup

To access most features of the AWS Toolkit, complete the [Setting Up](https://docs.aws.amazon.com/console/toolkit-for-vscode/getting-started) steps from the user guide.

1. [Create an AWS account](https://aws.amazon.com/premiumsupport/knowledge-center/create-and-activate-aws-account/) (see also [Prerequisites](https://docs.aws.amazon.com/console/toolkit-for-vscode/setup-toolkit#setup-prereq)).
1. [Create and configure](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/establish-credentials.html) your AWS credentials.
1. [Connect the Toolkit](https://docs.aws.amazon.com/console/toolkit-for-vscode/connect) to AWS with those credentials.

To develop [serverless applications](https://aws.amazon.com/serverless/) with the Toolkit, you must [set up your toolchain](https://docs.aws.amazon.com/console/toolkit-for-vscode/setup-toolchain) and do the following on the local machine where the Toolkit is installed:

1. Install the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html) (Command Line Interface).
1. Install and start [Docker](https://docs.docker.com/install/).
1. Install the AWS [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html).

{ [Return to Top](#top) }

---

# <a id="get-help"></a>Get help

For additional details on how to use the AWS Toolkit, see the [user guide](https://docs.aws.amazon.com/console/toolkit-for-vscode/welcome).

To report issues with the Toolkit or to propose Toolkit code changes, see the [aws/aws-toolkit-vscode](https://github.com/aws/aws-toolkit-vscode) repository on GitHub.

You can also [contact AWS](https://aws.amazon.com/contact-us/) directly.

{ [Return to Top](#top) }
