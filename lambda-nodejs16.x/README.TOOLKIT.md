# Developing AWS SAM Applications with the AWS Toolkit For Visual Studio Code

This project contains source code and supporting files for a serverless application that you can locally run, debug, and deploy to AWS with the AWS Toolkit For Visual Studio Code.

A "SAM" (serverless application model) project is a project that contains a template.yaml file which is understood by AWS tooling (such as SAM CLI, and the AWS Toolkit For Visual Studio Code).

## Writing and Debugging Serverless Applications

The code for this application will differ based on the runtime, but the path to a handler can be found in the [`template.yaml`](./template.yaml) file through a resource's `CodeUri` and `Handler` fields.

AWS Toolkit For Visual Studio Code supports local debugging for serverless applications through VS Code's debugger. Since this application was created by the AWS Toolkit, launch configurations for all included handlers have been generated and can be found in the menu next to the Run button:

-   lambda-nodejs16.x:HelloWorldFunction (nodejs16.x)
-   API lambda-nodejs16.x:HelloWorldFunction (nodejs16.x)

You can debug the Lambda handlers locally by adding a breakpoint to the source file, then running the launch configuration. This works by using Docker on your local machine.

Invocation parameters, including payloads and request parameters, can be edited either by the `Edit SAM Debug Configuration` command (through the Command Palette or CodeLens) or by editing the `launch.json` file.

AWS Lambda functions not defined in the [`template.yaml`](./template.yaml) file can be invoked and debugged by creating a launch configuration through the CodeLens over the function declaration, or with the `Add SAM Debug Configuration` command.

## Deploying Serverless Applications

You can deploy a serverless application by invoking the `AWS: Deploy SAM application` command through the Command Palette or by right-clicking the Lambda node in the AWS Explorer and entering the deployment region, a valid S3 bucket from the region, and the name of a CloudFormation stack to deploy to. You can monitor your deployment's progress through the `AWS Toolkit` Output Channel.

## Interacting With Deployed Serverless Applications

A successfully-deployed serverless application can be found in the AWS Explorer under region and CloudFormation node that the serverless application was deployed to.

In the AWS Explorer, you can invoke _remote_ AWS Lambda Functions by right-clicking the Lambda node and selecting "Invoke on AWS".

Similarly, if the Function declaration contained an API Gateway event, the API Gateway API can be found in the API Gateway node under the region node the serverless application was deployed to, and can be invoked via right-clicking the API node and selecting "Invoke on AWS".

## Resources

General information about this SAM project can be found in the [`README.md`](./README.md) file in this folder.

More information about using the AWS Toolkit For Visual Studio Code with serverless applications can be found [in the AWS documentation](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/serverless-apps.html) .
