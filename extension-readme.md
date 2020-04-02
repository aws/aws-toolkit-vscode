# <a id="top"></a>AWS Toolkit

The _AWS Toolkit_, or simply the _Toolkit_, is an extension that enables you to interact with certain services of [Amazon Web Services (AWS)](https://aws.amazon.com/what-is-aws/) from within the VS Code editor.

The following screenshots show important parts of the Toolkit.

## <a id="ui-components"></a>Fundamental UI Components

### <a id="ui-components-aws-expl"></a>The AWS Explorer

![Overview, AWS Explorer](./resources/marketplace/overview.png)

### <a id="ui-components-cdk-expl"></a>The AWS CDK Explorer

![Overview, AWS CDK Explorer](./resources/marketplace/overview-cdk.png)

### <a id="open-command-palette"></a>AWS Commands in the Command Palette

![Command Palette](./resources/marketplace/open-command-palette.gif)

---

# <a id="contents"></a>Contents

-   [Feature Overview](#feature-overview)
-   [Setup](#additional-setup-steps)
-   [Features](#features)
-   [Appendix A: AWS Commands](#aws-commands)
-   [Appendix B: Get Help](#get-help)

{ [Return to Top](#top) }

---

# <a id="feature-overview"></a>Feature Overview

You can use the AWS Toolkit to interact with several AWS resources in various ways.

These include the following:

-   AWS serverless applications

-   AWS Lambda functions

-   AWS CloudFormation stacks

-   AWS Cloud Development Kit (AWS CDK) applications

-   Amazon EventBridge schemas

-   Amazon Elastic Container Service (Amazon ECS) task definition files

-   AWS Step Functions state machines

See [Features](#features) below for high-level details, or jump right into the [_AWS Toolkit for Visual Studio Code User Guide_](https://docs.aws.amazon.com/console/toolkit-for-vscode/welcome).

{ [Return to Contents](#contents) } or { [Return to Top](#top) }

---

# <a id="additional-setup-steps"></a>Setup

To access most features of the AWS Toolkit, you must complete the steps defined in the [Setting Up](https://docs.aws.amazon.com/console/toolkit-for-vscode/getting-started) topic of the user guide.

These steps include the following:

1. Create an AWS account (see the [Prerequisites](https://docs.aws.amazon.com/console/toolkit-for-vscode/setup-toolkit#setup-prereq) in the user guide and also these [additional details](https://aws.amazon.com/premiumsupport/knowledge-center/create-and-activate-aws-account/))
1. Create and configure a set of AWS credentials (see [Establishing Credentials](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/establish-credentials.html) in the user guide)
1. Connect the Toolkit to AWS using those credentials (see [Connecting to AWS](https://docs.aws.amazon.com/console/toolkit-for-vscode/connect) in the user guide)

To use the Toolkit to develop [serverless applications with AWS](https://aws.amazon.com/serverless/), you must also [set up your toolchain](https://docs.aws.amazon.com/console/toolkit-for-vscode/setup-toolchain) and do the following on the local machine where the Toolkit is installed:

1. Install the AWS Command Line Interface (AWS CLI)
1. Install and start Docker (also see this general information about [Docker](https://docs.docker.com/install/))
1. Install the AWS SAM CLI

For complete setup instructions for these three components, see [Installing the AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html) in the _AWS Serverless Application Model (AWS SAM) Developer Guide_.

{ [Return to Contents](#contents) } or { [Return to Top](#top) }

---

# <a id="features"></a>Features

-   [Serverless Applications, Lambda Functions, and CloudFormation Stacks](#sam-and-lambda)
-   [AWS CDK Applications](#cdk-apps)
-   [Amazon EventBridge Schemas](#eventbridge)
-   [Amazon ECS Task Definition Files](#ecs-files)
-   [AWS Step Functions](#sfn-files)

{ [Return to Contents](#contents) } or { [Return to Top](#top) }

---

## <a id="sam-and-lambda"></a>Serverless Applications, Lambda Functions, and CloudFormation Stacks

The AWS Toolkit enables you to develop [AWS serverless applications](https://aws.amazon.com/serverless/) locally. It also enables you to do the following through the [AWS Explorer](#ui-components-aws-expl):

-   Deploy your locally-developed AWS serverless applications to an AWS account, into an [AWS CloudFormation](https://aws.amazon.com/cloudformation/) stack
-   List and delete AWS CloudFormation stacks
-   List, invoke, and delete [AWS Lambda](https://aws.amazon.com/lambda/) functions

The following example shows a highlight of this functionality.

After you have [created a serverless application](https://docs.aws.amazon.com/console/toolkit-for-vscode/create-sam), you can locally run, debug, and further develop that application in the VS Code editor. For example:

![Configure and Run 1](./resources/marketplace/sam-configure-and-run-still-1.png)

Take special note of the _CodeLenses_ that enable you to run and debug the application locally.

The status and results are shown in the **OUTPUT** panel when the **AWS Toolkit** output channel is selected.

![Configure and Run 1](./resources/marketplace/sam-configure-and-run-still-2.png)

When you're satisfied, you can [deploy your application](https://docs.aws.amazon.com/console/toolkit-for-vscode/deploy-serverless-app) to a CloudFormation stack and then [run the Lambda function](https://docs.aws.amazon.com/console/toolkit-for-vscode/remote-lambda) on AWS.

For full details, see the [AWS Explorer](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/aws-explorer.html) in the Toolkit's user guide.

#### Additional Information about CodeLenses

The functions that have Codelenses are those that use AWS Lambda-function handler syntax. A _handler_ is a function that Lambda calls to start execution of a Lambda function. These CodeLenses enable you to locally run or debug the corresponding serverless application. CodeLens actions in the Toolkit include:

-   **Configure**, for specifying function configurations such as an event payload and environment variable overrides.
-   **Run Locally**, for running the function _without_ debugging.
-   **Debug Locally**, for running the function _with_ debugging.

{ [Return to Features](#features) } or { [Return to Top](#top) }

---

## <a id="cdk-apps"></a>AWS CDK Applications

The AWS Toolkit enables you to work with [AWS Cloud Development Kit (AWS CDK)](https://aws.amazon.com/cdk/) applications. Using the [AWS CDK Explorer](#ui-components-cdk-expl) on the Toolkit, you can view CDK applications within your Workspace that have been synthesized.

Example:

![AWS CDK Tree View](./resources/marketplace/cdk-tree-view.png)

For full details, see the [AWS CDK Explorer](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/cdk-explorer.html) in the Toolkit's user guide.

{ [Return to Features](#features) } or { [Return to Top](#top) }

---

## <a id="eventbridge"></a>Amazon EventBridge Schemas

The AWS Toolkit provides support for [Amazon EventBridge](https://aws.amazon.com/eventbridge) schemas. Using the [AWS Explorer](#ui-components-aws-expl) of the Toolkit, you can perform the following operations on these schemas:

-   View an available schema
-   Search for an available schema
-   Generate code for an available schema

Example:

![View Amazon EventBridge Schemas](./resources/marketplace/eventbridge-search.png)

For full details, see [Working with Amazon EventBridge Schemas](https://docs.aws.amazon.com/console/toolkit-for-vscode/eventbridge-schemas) in the Toolkit's user guide.

{ [Return to Features](#features) } or { [Return to Top](#top) }

---

## <a id="ecs-files"></a>Amazon ECS Task Definition Files

The AWS Toolkit provides support for [Amazon Elastic Container Service (Amazon ECS)](https://aws.amazon.com/ecs). With the Toolkit installed in VS Code, IntelliSense functionality is provided for Amazon ECS task-definition files that you are updating in the editor.

Example:

![Amazon ECS IntelliSense for Task Definition Files](./resources/marketplace/ecs-task-def-intellisense.png)

For full details, see [Working with Amazon Elastic Container Service](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/ecs.html) in the Toolkit's user guide.

{ [Return to Features](#features) } or { [Return to Top](#top) }

---

## <a id="sfn-files"></a>AWS Step Functions

The AWS Toolkit provides support for [AWS Step Functions](https://docs.aws.amazon.com/step-functions). With the Toolkit installed in VS Code, working with state machines is a more streamlined process.

-   Create, update, execute, and download state machines.
-   See live graph visualizations of your state machine.
-   Take advantage of features such as code completion and validation, and code snippets.

Example:

![AWS Step Functions](./resources/marketplace/sfn-state-machine.png)

For full details, see [Working with AWS Step Functions](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/stepfunctions.html) in the Toolkit's user guide.

{ [Return to Features](#features) } or { [Return to Top](#top) }

---

# <a id="aws-commands"></a>Appendix A: AWS Commands

The AWS Toolkit has several features that you can access through the [Command Palette](#open-command-palette) (select **View**, then **Command Palette**):

| AWS Command                                        | Description                                                                                                                                                                                                                                                                                                    |
| :------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AWS: Create Credentials Profile**                | Creates an AWS credentials profile. For more information, see [Setting Up Your AWS Credentials](https://docs.aws.amazon.com/console/toolkit-for-vscode/setup-credentials) in the user guide.                                                                                                                   |
| **AWS: Connect to AWS**                            | Connects the Toolkit to an AWS account. For more information, see [Connecting to AWS](https://docs.aws.amazon.com/console/toolkit-for-vscode/connect) in the user guide.                                                                                                                                       |
| **AWS: Create a new Step Functions state machine** | Generates a new Amazon States Language definition to use as the definition for a new Step Functions state machine. For more information, see [State Machine Templates](https://docs.aws.amazon.com//toolkit-for-vscode/latest/userguide/bulding-stepfunctions.html#templates-stepfunctions) in the user guide. |
| **AWS: Create New SAM Application**                | Generates a set of code files for a new AWS serverless application. For more information, see [Creating a Serverless Application](https://docs.aws.amazon.com/console/toolkit-for-vscode/create-sam) in the user guide.                                                                                        |
| **AWS: Deploy SAM Application**                    | Deploys a local serverless application to an AWS account. For more information, see [Deploying a Serverless Application](https://docs.aws.amazon.com/console/toolkit-for-vscode/deploy-serverless-app) in the user guide.                                                                                      |
| **AWS: Detect SAM CLI**                            | Checks whether the Toolkit can communicate correctly with the AWS SAM CLI that is installed.                                                                                                                                                                                                                   |
| **AWS: Focus on Explorer View**                    | Opens the **AWS: Explorer** Side Bar, which we will simply call [_the **AWS Explorer**_](#ui-components-aws-expl), and then moves the focus there.                                                                                                                                                             |
| **AWS: Hide region from the Explorer**             | Hides an AWS Region from the **AWS Explorer**.                                                                                                                                                                                                                                                                 |
| **AWS: Publish state machine to Step Functions**   | Creates or updates a remote state machine using the local Amazon States Language definition file. For more information, see [Work With State Machines in VS Code](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/bulding-stepfunctions.html#starting-stepfunctions) in the user guide.        |
| **AWS: Render state machine graph**                | Renders the state machine definition into a graph visualization. For more information, see [State Machine Graph Visualization](https://docs.aws.amazon.com//toolkit-for-vscode/latest/userguide/bulding-stepfunctions.html#bulding-stepfunctions-visualizations) in the user guide.                            |
| **AWS: Report an Issue**                           | In the [GitHub repository](https://github.com/aws/aws-toolkit-vscode) for the Toolkit, opens the page to [create a new issue](https://github.com/aws/aws-toolkit-vscode/issues/new/choose).                                                                                                                    |
| **AWS: Show region in the Explorer**               | Displays an AWS Region in the **AWS Explorer**.                                                                                                                                                                                                                                                                |
| **AWS: Sign out**                                  | Disconnects the Toolkit from the currently-connected AWS account.                                                                                                                                                                                                                                              |
| **AWS: View AWS Toolkit Logs**                     | Displays log files that contain general Toolkit diagnostic information.                                                                                                                                                                                                                                        |
| **AWS: View Quick Start**                          | Open this quick-start guide.                                                                                                                                                                                                                                                                                   |
| **AWS: View Documentation**                        | Opens the [user guide](https://docs.aws.amazon.com/console/toolkit-for-vscode/welcome) for the Toolkit.                                                                                                                                                                                                        |
| **AWS: View Source on GitHub**                     | Opens the [GitHub repository](https://github.com/aws/aws-toolkit-vscode) for the Toolkit.                                                                                                                                                                                                                      |

{ [Return to Contents](#contents) } or { [Return to Top](#top) }

---

# <a id="get-help"></a>Appendix B: Get Help

For additional details on how to use the AWS Toolkit, see the [user guide](https://docs.aws.amazon.com/console/toolkit-for-vscode/welcome).

To report issues with the Toolkit or to propose Toolkit code changes, see the [aws/aws-toolkit-vscode](https://github.com/aws/aws-toolkit-vscode) repository on GitHub.

You can also [contact AWS](https://aws.amazon.com/contact-us/) directly.

{ [Return to Contents](#contents) } or { [Return to Top](#top) }
