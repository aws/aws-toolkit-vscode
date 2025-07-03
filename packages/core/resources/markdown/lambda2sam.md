# Welcome to Lambda Development with AWS SAM

This project was generated from existing ${sourceType} to ${stackName} stack using the AWS Toolkit for VS Code. Your Lambda functions are now a project in AWS Serverless Application Model (SAM). Here, you can manage your functions as infrastructure as code using the AWS SAM template. This eliminates the need for manual changes in the AWS Console, provides better version control, and allows automated deployments of your serverless resources.

${warning}

## Prerequisites

Confirm you have installed the following tools:

-   **The AWS CLI**: Needed to interact with AWS services from the command line.
-   **The AWS SAM CLI:** Needed to locally build, invoke, and deploy your functions. Version 1.98+ is required.
-   **Docker**: Optional, but required if you want to invoke locally, Docker is required.

**Note:** For help on installing these tools, choose the **Application Builder** panel in **EXPLORER** or the AWS Toolkit Extension, and select **Walkthrough of Application Builder**.

## What you can do with AWS SAM

Your functions are ready for local development. You can either use the **AWS Application Builder** or the **SAM CLI** to edit and manage your functions.

To get started using Application Builder, choose the **Application Builder** panel in **EXPLORER** or the AWS Toolkit Extension, and select **Walkthrough of Application Builder**.

Use the following SAM CLI commands to manage your functions:

-   **Build Your Code:** Run [`sam build`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html) in the terminal to compile your code and install dependencies.
-   **Test Locally:** Run the [`sam local invoke`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-local-invoke.html) and [`sam local start-api`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-local-start-api.html)commands in the terminal.
-   **Deploy Your Changes:** Run [`sam deploy --guided`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-deploy.html) in the terminal to deploy your updated function to AWS.
-   **Verify Deployment:** Run [`sam remote invoke`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-remote-invoke.html) or go to the Lambda Console

## Quick Reference

-   **SAM Template**: [template.yaml](./template.yaml) - Contains your infrastructure as code
-   **SAM Configuration**: [samconfig.toml](./samconfig.toml) - Contains deployment configuration

## Advanced features

You can also debug your functions locally with breakpoints, manage environment variables, work with layers and dependencies, and configure function triggers and permissions through the AWS Toolkit interface. For more details, refer to the following resources

-   [AWS toolkit for Visual Studio Code User Guide](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/welcome.html)
-   [Working with Application Builder](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/appbuilder-overview-overview.html)
-   [AWS SAM Developer Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
-   [AWS SAM command line reference](http://https//docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-command-reference.html)
