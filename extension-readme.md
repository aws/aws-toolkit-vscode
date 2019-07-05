# <a id="top"></a>AWS Toolkit for Visual Studio Code

The *AWS Toolkit for Visual Studio Code* is an extension that enables you to interact with [Amazon Web Services (AWS)](https://aws.amazon.com/what-is-aws/) from within the Visual Studio Code editor.

The following screedshots show important parts of the Toolkit.

### Fundamental UI Components

![Overview](./resources/marketplace/overview.png)

### <a id="open-command-palette"></a>AWS Commands in the Command Palette
<!--
![AWS Commands](./resources/marketplace/open-command-palette.png)
-->

![Command Palette](./resources/marketplace/open-command-palette.gif)
___

# <a id="contents"></a>Contents

* [Features](#features)
* [Setup](#additional-setup-steps)
* [AWS Commands](#aws-commands)
* [Usage](#usage)
* [Get Help](#get-help)

| [Return to Top](#top) |
___

# <a id="features"></a>Features

You can use the AWS Toolkit for Visual Studio Code as follows:

* Develop serverless applications locally, and then deploy them to an AWS account (see [Usage](#usage))
* Manage certain supported AWS resources in an AWS account (see [Usage](#usage)).

  This includes:
  * Listing and deleting AWS CloudFormation stacks
  * Listing and invoking AWS Lambda functions

  For example:

  ![AWS Explorer](./resources/marketplace/aws-explorer.png)

| [Return to Contents](#contents) | or | [Return to Top](#top) |
___

# <a id="additional-setup-steps"></a>Setup

After you install the AWS Toolkit for Visual Studio Code, to access most of its features, you must complete the additional steps defined in the [Getting Started](https://docs.aws.amazon.com/console/toolkit-for-vscode/getting-started) topic of the _AWS Toolkit for Visual Studio Code User Guide_. These additional steps include the following:

1. Create an AWS account (see the [Prerequisites](https://docs.aws.amazon.com/console/toolkit-for-vscode/setup-toolkit#setup-prereq) in the user guide and also these [additional details](https://aws.amazon.com/premiumsupport/knowledge-center/create-and-activate-aws-account/))
1. Create and configure a set of AWS credentials (see **Step 1** of [Managing AWS Resources](#managing-aws-resources))
1. Connect the Toolkit to AWS using those credentials (see **Step 2** of [Managing AWS Resources](#managing-aws-resources))

To use this Toolkit to develop [serverless applications with AWS](https://aws.amazon.com/serverless/), you must also do the following on the local machine where the Toolkit is installed:

1. Install the AWS Command Line Interface (AWS CLI)
1. Install and start Docker (also see this general information about [Docker](https://docs.docker.com/install/))
1. Install the AWS SAM CLI

See [Installing the AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html) for complete setup instructions for these three components.

| [Return to Contents](#contents) | or | [Return to Top](#top) |
___

# <a id="aws-commands"></a>AWS Commands

The AWS Toolkit for Visual Studio Code has several features that you can access through the [Command Palette](#open-command-palette) (**View**, then **Command Palette**):

| AWS Command | Description |
| :---------- | :---------- |
| **AWS: Create Credentials Profile** | Creates an AWS credentials profile. For more information, see **Step 1** in [Managing AWS Resources](#managing-aws-resources). |
| **AWS: Connect to AWS** | Connects the Toolkit to an AWS account. For more information, see **Step 2** in [Managing AWS Resources](#managing-aws-resources). |
| **AWS: Create New SAM Application** | Generates a set of code files for a new AWS serverless application. For more information, see [Create a Serverless Application](#create-serverless-application). |
| **AWS: Deploy SAM Application** | Deploys a local serverless application to an AWS account. For more information, see [Deploy a Serverless Application](#deploy-serverless-application). |
| **AWS: Detect SAM CLI** | Checks whether the Toolkit can communicate correctly with the AWS SAM CLI that is installed. |
| **AWS: Focus on Explorer View** | Opens the **AWS: Explorer** Side Bar, which we will simply call _the **AWS Explorer**_, and then moves the focus there. |
| **AWS: Hide region from the Explorer** | Hides an AWS Region from the the **AWS Explorer**. |
| **AWS: Show region in the Explorer** | Displays an AWS Region in the **AWS Explorer**. |
| **AWS: Sign out** | Disconnects the Toolkit from the currently-connected AWS account. |
| **AWS: View AWS Toolkit Logs** | Displays log files that contain general Toolkit diagnostic information. |
| **AWS: View Documentation** | Opens the [user guide](https://docs.aws.amazon.com/console/toolkit-for-vscode/welcome) for the Toolkit. |
| **AWS: View Source on GitHub** | Opens the [GitHub repository](https://github.com/aws/aws-toolkit-vscode) for the Toolkit. |

| [Return to Contents](#contents) | or | [Return to Top](#top) |
___

# <a id="usage"></a>Usage

* [Managing AWS Resources](#managing-aws-resources)
* [Developing Serverless Applications](#developing-serverless-applications)

| [Return to Contents](#contents) | or | [Return to Top](#top) |

## <a id="managing-aws-resources"></a>Usage: Managing AWS Resources
___

### **Step 1**: Set Up a Credentials Profile
(*Note*: If you already have an AWS credentials profile, skip ahead to "**Step 2**: Connect to an AWS Account".)

For complete instructions, see [Setting Up Your AWS Credentials](https://docs.aws.amazon.com/console/toolkit-for-vscode/setup-credentials) in the _AWS Toolkit for Visual Studio Code User Guide_.

   In summary:
1. On the menu bar, choose **View, Command Palette**.
1. Begin typing: "**AWS: Create Credentials Profile**" and choose that command when you see it.
1. Follow the on-screen instructions to add an AWS credentials profile to your environment. 

### **Step 2**: Connect to an AWS Account

For complete instructions, see [Connect to AWS](https://docs.aws.amazon.com/console/toolkit-for-vscode/connect) in the _AWS Toolkit for Visual Studio Code User Guide_ .

In summary:
1. On the menu bar, choose **View, Command Palette**.
1. Begin typing "**AWS: Connect to AWS**" and choose that command when you see it.
1. In the list of AWS credentials profiles, choose the profile that you want to use.

### **Step 3**: Work with Available AWS Resources

For complete information, see [Working with AWS Services](https://docs.aws.amazon.com/console/toolkit-for-vscode/working-with-aws) in the _AWS Toolkit for Visual Studio Code User Guide_ .

1. If the **AWS Explorer** isn't showing, open it by choosing the **AWS** icon in the Activity Bar:
   
   ![AWS Explorer Icon](./resources/marketplace/aws-explorer-icon.png)
2. If you have existing resources in your AWS account but they aren't being displayed in the **AWS Explorer** (and assuming that your credentials and a connection have been set up properly), choose the **Refresh** icon in the **AWS Explorer** to show them. 
3. Expand the AWS Region that contains the resource that you want to manage.

   (**Note**: To show or hide AWS regions, choose **View, Command Palette** on the menu bar, and then choose **AWS: Show region in the Explorer** or **AWS: Hide region from the Explorer**.)
4. Expand the supported AWS service that contains the resource that you want to manage.

   (**Note**: Not all services are currently supported.)
5. If applicable, expand the parent resource that contains the child resource that you want to manage.
6. Open the context menu of the resource you want to manage and choose one of the available actions.

   (**Note**: Not all service actions are currently supported.)

| [Return to Usage](#usage) |

## <a id="developing-serverless-applications"></a>Usage: Developing Serverless Applications
___

You can use the AWS Toolkit for Visual Studio Code to create, run, debug, and deploy serverless applications.

* [Create a Serverless Application](#create-serverless-application)
* [Run or Debug a Serverless Application](#run-debug-serverless-application)
* [Deploy a Serverless Application](#deploy-serverless-application)

| [Return to Usage](#usage) |

### <a id="create-serverless-application"></a>**Step 1**: Create a Serverless Application

For complete instructions, see [Creating a Serverless Application](https://docs.aws.amazon.com/console/toolkit-for-vscode/create-sam) in the _AWS Toolkit for Visual Studio Code User Guide_.

In summary:
1. On the menu bar, choose **View, Command Palette**.
2. Begin typing "**AWS: Create new SAM Application**" and choose that command when you see it.
3. Follow the on-screen instructions to finish creating the SAM application.
   
   For example:

   ![Create SAM App](./resources/marketplace/create-sam-app-still.png)


The Toolkit produces the application code and files, adds them to the location you specified, and opens the `template.yaml` file in the editor.


| [Return to Developing](#developing-serverless-applications) | or | [Return to Usage](#usage) |

### <a id="run-debug-serverless-application"></a>**Step 2**: Run or Debug the Serverless Application

![Configure and Run](./resources/marketplace/sam-configure-and-run.gif)

(_Clip is time lapsed_)

After you choose the **AWS** icon in the Activity Bar, CodeLenses display within open serverless application code files above functions that use AWS Lambda function handler syntax. (A _handler_ is a function that Lambda calls to start execution of a Lambda function.) These CodeLenses enable you to run or debug the corresponding serverless application locally. CodeLens actions here include:

* **Configure**, for specifying function configurations such as an event payload and environment variables.
* **Run Locally**, for running the function without debugging.
* **Debug Locally**, for running the function with debugging.

(For general information about running and debugging in VS Code, see [Debugging](https://code.visualstudio.com/docs/editor/debugging) on the VS Code website.)

For information about how to work with remote versions of Lambda functions, see [Interacting with Remote Lambda Functions](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/remote-lambda.html) in the _AWS Toolkit for Visual Studio Code User Guide_.

| [Return to Developing](#developing-serverless-applications) | or | [Return to Usage](#usage) |

### <a id="deploy-serverless-application"></a>**Step 3**: Deploy the Serverless Application

![Deploy SAM Application](./resources/marketplace/sam-deploy.gif)

(_Clip is time lapsed_)

Before you start this procedure, you must have an Amazon S3 bucket in the AWS account. The AWS Toolkit for Visual Studio Code will use this bucket when packaging and deploying the application. (To create a bucket, see [How Do I Create an S3 Bucket](https://docs.aws.amazon.com/AmazonS3/latest/user-guide/create-bucket.html) in the _Amazon Simple Storage Service Console User Guide_.)  

1. On the menu bar, choose **View, Command Palette**.
2. Begin typing: `AWS: Deploy SAM Application`. When you see the **AWS: Deploy SAM Application** command, choose it.
3. Follow the on-screen instructions to finish deploying the serverless application, including:
    
   1. Choosing the SAM template file that corresponds with the serverless application you want to deploy.
   2. Choosing the AWS Region you want to deploy to.
   3. Specifying the name of an existing Amazon S3 bucket in the AWS account that the Toolkit will use for packaging and deploying the serverless application. (The Toolkit uses Amazon S3 as part of its process to deploy serverless applications.) The bucket must exist within the AWS Region that you chose earlier.

4. The serverless application is deployed to an AWS CloudFormation stack. (The Toolkit uses AWS CloudFormation as part of its process to deploy serverless applications.) If the stack already exists, it is updated; otherwise, a new stack is created. Within a few minutes, the Toolkit displays a deployment success or failure message.
5. To work with the corresponding stack that the Toolkit creates in AWS CloudFormation, in the **AWS Explorer**, expand the AWS Region that contains the stack. Then expand **AWS CloudFormation**. Lastly, expand or right-click on the stack that you want to manage.

For more information, see [Deploying a Serverless Application](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/deploy-serverless-app.html) in the _AWS Toolkit for Visual Studio Code User Guide_. 

| [Return to Developing](#developing-serverless-applications) | or | [Return to Usage](#usage) |
___

# <a id="get-help"></a>Get Help

For additional details on how to use the AWS Toolkit for Visual Studio Code, see the [user guide](https://docs.aws.amazon.com/console/toolkit-for-vscode/welcome).

To report issues with the AWS Toolkit for Visual Studio Code or to propose Toolkit code changes, see the [aws/aws-toolkit-vscode](https://github.com/aws/aws-toolkit-vscode) repository on GitHub.

You can also [contact AWS](https://aws.amazon.com/contact-us/) directly.

| [Return to Top](#top) |
