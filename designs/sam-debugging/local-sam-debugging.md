# User Experience: Local Debugging SAM Applications

Current Status: Proposed, Not Implemented

## <a id="introduction"> Introduction

The AWS Toolkit enhances the Serverless Application Model (SAM) Application development experience by integrating local debug functionality into VS Code. This document outlines the user experience.

While this document's main focus is on debugging capabilities in the toolkit, there are places where the experience around invoking without the debugger (aka "running") is also discussed.

Each programming language (and corresponding Lambda Runtimes) requires Toolkit support for debugging features to work. As of v1.6.1 (Feb 2020), the following languages and runtimes are supported:

-   javascript (nodejs10.x, nodejs12.x)
-   python (python2.7, python3.6, python3.7, python3.8)
-   C# (dotnetcore2.1)

## Overview

The toolkit supports the following scenarios for Locally Running and Debugging code using the Serverless Application Model:

-   invoking [SAM Template](#terms-sam-template) resources that are Lambda functions
-   making API Gateway style requests against SAM Template resources that are Lambda functions
-   invoking standalone Lambda function handlers (these don't use SAM Templates, but the debugging functionality is supported by one behind the scenes)

Each scenario has one or more relevant user experiences. The different debugging functionalities are discussed first. Then, the various user experiences are discussed, along with which scenarios they apply to.

## What can be Debugged Locally

TODO : WIP

### Lambda Functions Invoked Directly

### <a id="sam-template-resource-local"></a> SAM Template Resources (Local Invoke)

Lambda functions are represented in CloudFormation templates as resources of type [`AWS::Lambda::Function`](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-function.html) or [`AWS::Serverless::Function`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-resource-function.html). With the Toolkit, users can locally invoke Lambda function code, optionally passing a custom event to it. The Toolkit uses SAM CLI to invoke the Lambda function, emulating how the function is run on AWS, then attaches a debugger to the invoked function.

### <a id="standalone-lambda"></a> Standalone Lambda Function Handlers

Lambda function handler code can be locally Run or Debugged independent of any SAM Application. This functionality is powered by SAM in order to provide a host to the Lambda hander. The Toolkit produces a temporary SAM Application that references the handler code. This temporary SAM Application is handled as mentioned [earlier](#sam-template-resource-local). At the end of the debug session, the temporary SAM Application is removed.

In this mode, any SAM Templates that reference a handler are ignored. This prevents confusion/errors introduced when trying to perform a reverse-lookup between code and SAM Template resources (examples include incorrectly determining a function's Lambda handler string, or situations where more than one resource references the same function).

The Toolkit does not provide support for locally running or debugging standalone Lambda function handlers as API Gateway calls. The code should be referenced from a SAM Template in order to use the API Gateway style debugging features mentioned in the earlier section.

### Lambda Functions Invoked via API Gateway

### <a id="sam-template-resource-api-gateway"></a> SAM Template Resources (API Gateway style Local Invoke)

SAM Template resources that contain an event of type [Api](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-function-api.html), can be hosted in a web server for local development and iteration. A REST request causes the Lambda function to receive an API Gateway based event.

At this time, an experience for API Gateway support is not available. Some portions of this document (Debug Configurations for example) have considerations made for supporting API Gateway functionality.

TODO : END WIP

## <a id="debug-config"></a> What can be configured for a Debug session?

The following parameters influence a debug session. These are user-configured, and are referenced by the various [debugging experiences](#debugging-experiences).

| Property                | Description                                                                                                                                                                             | Where is it located                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| SAM Template            | Path to SAM Template file - Only applies to invoking Resources                                                                                                                          | Debug Configuration                                                                             |
| SAM Template Resource   | Name of lambda function-based resource within SAM Template - Only applies to invoking Resources                                                                                         | Debug Configuration                                                                             |
| SAM Template Parameters | Values to use for [Parameters](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/parameters-section-structure.html) in a SAM Template - Only applies to invoking Resources | Debug Configuration                                                                             |
| Environment Variables   | Environment Variables exposed to the Lambda Function                                                                                                                                    | Debug Configuration                                                                             |
| Input Event             | Payload passed to the invoked Lambda Function                                                                                                                                           | Debug Configuration                                                                             |
| Runtime                 | Runtime of Lambda Function to invoke                                                                                                                                                    | CloudFormation Template when running a Resource, Debug Configuration when directly running code |
| Handler                 | Lambda Function handler to invoke                                                                                                                                                       | CloudFormation Template when running a Resource, Debug Configuration when directly running code |
| Timeout                 | Timeout threshold for Lambda function                                                                                                                                                   | CloudFormation Template                                                                         |
| Memory                  | Memory provided to Lambda function                                                                                                                                                      | CloudFormation Template                                                                         |

The following SAM CLI related arguments are relevant to debugging both standalone lambda function handlers and sam template resources. For reference see the [sam build](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html) command.

| Property                     | Description                                                                                                                                                                                                                      | Default Value                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Build SAM App in container   | Supports cases where dependencies have natively compiled dependencies (See [use-container](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html))             | false                            |
| Skip new image check         | Skips checking/downloading the latest Lambda Runtime Docker images every invoke (See [skip-pull-image](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html)) | false                            |
| Use a docker network         | Connects invoked SAM App to a Docker network (See [docker-network](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html))                                     | empty string (no docker network) |
| Additional build args        | These are passed along to `sam build` calls                                                                                                                                                                                      | empty string                     |
| Additional local invoke args | These are passed along to `sam local` calls                                                                                                                                                                                      | empty string                     |

The following AWS related arguments are relevant to debugging both standalone lambda function handlers and sam template resources. When provided, they are injected into the local Lambda containers running the invoked SAM Application. This is useful in scenarios where the Lambda running locally is accessing other AWS resources.

| Property    | Description                                                                                                                                                        | Default Value                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Credentials | Provides credentials to the Lambda function being invoked. Set this to the Credentials ID as shown in the Credentials selection list (example: `profile:default`). | The Toolkit's active credentials are used. No credentials are provided to the local Lambda container if the user is not connected to AWS. |
| Region      | Region assumed by the local Lambda container                                                                                                                       | us-east-1                                                                                                                                 |

## <a id="debugging-experiences"></a> Local Debugging Experiences

### <a id="debug-configurations"></a> Debug Configurations

[Debug Configurations](#terms-debug-configuration) are the idiomatic approach to running and debugging software in VS Code. They are also a reusable component - the Toolkit is able to internally produce and execute these configurations on the fly. This is the Toolkit's main experience for debugging SAM Template resources.

The Toolkit provides a Debug Configuration type `aws-sam`. Users author and maintain these configuration entries. When users launch an `aws-sam` debug configuration, the toolkit performs the following:

-   the debug configuration is validated (see [Debug Configuration Validations](#debug-configuration-validation)). In some situations, the launch is stopped.
-   a SAM Application's code is built
-   a SAM Template resource is invoked
-   a debugger is attached to the invoke (this is skipped if the debug configuration was launched using "Run without Debugging")
    -   debug output is shown in the Debug Console of VS Code during this Debug Session

The Debug Console can only be written to when VS Code has an active debug session. Launch progress is written to the Toolkit's Output Channel until a debugger is attached.

During the launch sequence, the Toolkit writes the SAM CLI commands it executes to the Output Channel. This allows users to see what is happening behind the scenes.

Debug configurations reside in a JSON file. The Toolkit assists users working with `aws-sam` entries in the following ways:

-   users see autocompletion for `aws-sam` related fields
    -   autocompletion is not available for open ended configuration values. For example, when a user types in the location of a SAM Template file, there is no filesystem-based autocompletion. The toolkit validates `aws-sam` debug configurations when launched, and notifies users as errant values are detected.
-   users see field descriptions (tooltips) for `aws-sam` related fields
-   users have access to snippets that produce typical (or starter) `aws-sam` debug configurations
-   the toolkit is capable of generating an `aws-sam` Debug Configuration for all `AWS::Serverless::Function` resources detected within a workspace

Example Debug Configuration entries can be found in the [Appendix](#sample-debug-configurations).

### <a id="codelenses"></a> CodeLenses

The Toolkit uses [CodeLenses](#terms-codelenses) as a shortcut to launching `aws-sam` [Debug Configurations](#debug-configurations).

Some users find CodeLenses visually distracting, while others use the Toolkit for features not related to local debugging. The Toolkit's CodeLenses are enabled by default, but can be disabled in the Toolkit settings.

The CodeLenses discussed below only appear for languages/runtimes that the Toolkit provides support for (see [Introduction](#introduction)).

#### CodeLenses in SAM Template files

The Toolkit adds CodeLenses to SAM Template files, above every resource of type `AWS::Serverless::Function`. These CodeLenses provide users with an alternate way of launching `aws-sam` debug configurations.

Two CodeLenses are added: "Run Locally", and "Debug Locally". The only difference between the two is whether or not a debugger is involved. When users click either CodeLens, the Toolkit shows a selection picker. The picker presents users with the following choices:

-   "Invoke \<Debug Configuration Name\>" - The picker contains one of these for every debug configuration found that references this SAM Template and resource. If users select this choice, the toolkit launches the corresponding debug configuration, as if the user launched it from VS Code's Debug view.
-   "Add Debug Configuration" - If users select this choice, the toolkit produces a pre-filled `aws-sam` Debug Configuration, configured to invoke the resource being acted on. Users are taken to the new entry in `launch.json` instead of starting a debug session.

#### CodeLenses in Code files

The Toolkit adds CodeLenses to functions considered [eligible Lambda handlers](#eligible-lambda-handler).

Two CodeLenses are added: "Run Locally", and "Debug Locally". The only difference between the two is whether or not a debugger is involved. When users click either CodeLens, the Toolkit shows a selection picker. The picker presents users with the following choices:

-   "Invoke \<Debug Configuration Name\>" - The picker contains one of these for every debug configuration found that references this lambda handler. This includes debug configurations that directly reference this function, and those that reference this function through SAM Template resources. If users select this choice, the toolkit launches the corresponding debug configuration, as if the user launched it from VS Code's Debug view.
-   "Add Debug Configuration" - If users select this choice, the toolkit produces a pre-filled `aws-sam` Debug Configuration, configured to directly invoke the function being acted on. Users are taken to the new entry in `launch.json` instead of starting a debug session.

## Appendix

### Terminology

#### <a id="terms-codelenses"></a> CodeLens

CodeLenses are visual decorators anchored to document locations. They are used to convey information and/or provide links that trigger an action. Additional information and examples about CodeLenses can be found [on the VS Code blog](https://code.visualstudio.com/blogs/2017/02/12/code-lens-roundup).

#### <a id="terms-debug-configuration"></a> Debug Configuration

Debug Configurations are user-managed JSON entries that define what programs can be debugged. After users select a Debug Configuration in VS Code's Debug View, they can start a Debug session by pressing the Debug button or using a hotkey (`F5` is the default). VS Code extensions increase the debugging capablities of VS Code by implementing Debug Configuration types.

Debug Configurations are stored in `.vscode/launch.json` relative to the VS Code workspace.

More information about VS Code Debugging can be found [in the VS Code Documentation](https://code.visualstudio.com/docs/editor/debugging).

#### <a id="terms-sam-template"></a> SAM Template

A SAM Template defines a Serverless Application's resources, and supporting code. The SAM CLI provides tooling around this template model to build, run, package, and deploy the Application.

Additional information about SAM can be found at:

-   [SAM Homepage](https://aws.amazon.com/serverless/sam/)
-   [What Is the AWS Serverless Application Model (AWS SAM)?](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html) (includes a Getting Started guide to the SAM CLI)
-   [SAM CLI GitHub Repo](https://github.com/awslabs/aws-sam-cli)

### Differences between this design, and v1.0.0 (through present versions) of AWS Toolkit

The debug capabilities initially released in the Toolkit were not well rounded. CodeLenses provided the only means of local debugging, and without a way to directly debug SAM Template resources these CodeLenses tried to compensate, leading to scenarios with undefined behaviors. Many of the issues are referenced from https://github.com/aws/aws-toolkit-vscode/issues/758

Here is an outline of the differences between this design and the current version of the AWS Toolkit:

-   Changed functionality
    -   CodeLenses on code files now provide the abilitiy to invoke a function in isolation, or as part of a SAM Template. Previously, they could only be invoked as part of a SAM Template.
-   New functionality
    -   `aws-sam` Debug Configurations provide a new way to launch debug sessions against SAM Template resources
    -   CodeLens provide debugging capabilities from SAM Template files
    -   API Gateway related debugging (TBD)
-   Removed functionality
    -   CodeLenses are now pointers to Debug Configurations, and do not directly launch debug sessions on their own. The configuration files that were used by the old functionality are no longer relevant/used

### <a id="sample-debug-configurations"></a> Sample Debug Configurations

Configuration structures group related parameters and reuse shapes where possible.

Here is an example Debug Configuration to debug a SAM Template resource called "HelloWorldResource".
The only required fields are: type, request, samTemplate.path, samTemplate.resource

```jsonc
{
    "configurations": [
        {
            "name": "Debug HelloWorldResource", // Users name the entry; shown in Debug dropdown
            "type": "aws-sam",
            "request": "template-invoke", // This is the "aws-sam" variation for debugging SAM Template resources
            "samTemplate": {
                "path": "path to template yaml file",
                "resource": "HelloWorldResource", // Name of Template resource to debug
                // SAM Template Parameter substitutions
                "parameters": {
                    "param1": "somevalue"
                }
            },
            // Lambda Execution related arguments
            "lambda": {
                // Environment Variables accessible by Lambda handler
                "environmentVariables": {
                    "envvar1": "somevalue",
                    "envvar2": "..."
                },
                // The event passed to the Lambda handler (defaults to an empty JSON object)
                "event": {
                    // path or json, not both
                    "path": "somepath", // Path to event data
                    "json": {
                        // event data
                    }
                }
            },
            // SAM CLI related arguments
            "sam": {
                "containerBuild": false,
                "skipNewImageCheck": false,
                "dockerNetwork": "aaaaa",
                "buildArguments": "--foo",
                "localArguments": "--foo"
            },
            // AWS related arguments
            "aws": {
                "credentials": "profile:default",
                "region": "us-west-2"
            }
        }
    ]
}
```

Here is an example Debug Configuration to debug an API Gateway invoked SAM Template resource called "HelloWorldResource".
The variation is defined by the `request` field, and the only difference is in the event field.
The only required fields are: type, request, samTemplate.path, samTemplate.resource

```jsonc
{
    "configurations": [
        {
            "name": "a2",
            "type": "aws-sam",
            "request": "template-api", // This is the "aws-sam" variation for debugging API Gateway invoked SAM Template resources
            "samTemplate": {
                "path": "some path",
                "resource": "HelloWorldResource",
                "parameters": {
                    "param1": "somevalue"
                }
            },
            // Lambda Execution related arguments
            "lambda": {
                // Environment Variables accessible by Lambda handler
                "environmentVariables": {
                    "envvar1": "somevalue",
                    "envvar2": "..."
                },
                // The API call made to the handler once invoked
                "event": {
                    "api": {
                        "path": "/bee",
                        "method": "get",
                        "query": "aaa=1&bbb=2",
                        "body": "text - can we do this?"
                    }
                }
            },
            "sam": {
                "containerBuild": false,
                "skipNewImageCheck": false,
                "dockerNetwork": "aaaaa",
                "buildArguments": "--foo",
                "localArguments": "--foo"
            },
            "aws": {
                "credentials": "profile:default",
                "region": "us-west-2"
            }
        }
    ]
}
```

Here is an example Debug Configuration to directly invoke and debug a Lambda handler function.
The variation is defined by the `request` field. The differences compared to the "template-invoke" variant are the `lambdaEntry` object, and an extended `lambda` structure.
The only required fields are: type, request, lambdaEntry, lambda.runtime

```jsonc
{
    "configurations": [
        {
            "name": "Debug Lambda Handler MyFunctionHandler", // Users name the entry; shown in Debug dropdown
            "type": "aws-sam",
            "request": "standalone-lambda", // This is the "aws-sam" variation for debugging standalone Lambda handlers
            "lambdaEntry": {
                "projectRoot": "path to folder", // The top level folder to run the Lambda handler in (this affects the lambdaHandler field in runtimes like node and python).
                "lambdaHandler": "HelloWorld::HelloWorld.Function::MyFunctionHandler" // nodeJs example: app.lambdaHandler
            },
            // Lambda Execution related arguments
            "lambda": {
                "runtime": "someruntime",
                "timeoutSec": 30,
                "memoryMb": 128,
                // Environment Variables accessible by Lambda handler
                "environmentVariables": {
                    "envvar1": "somevalue",
                    "envvar2": "..."
                },
                // The event passed to the Lambda handler (defaults to an empty JSON object)
                "event": {
                    // path or json, not both
                    "path": "somepath", // Path to event data
                    "json": {
                        // event data
                    }
                }
            },
            // SAM CLI related arguments
            "sam": {
                "containerBuild": false,
                "skipNewImageCheck": false,
                "dockerNetwork": "aaaaa",
                "buildArguments": "--foo",
                "localArguments": "--foo"
            },
            // AWS related arguments
            "aws": {
                "credentials": "profile:default",
                "region": "us-west-2"
            }
        }
    ]
}
```

### <a id="debug-configuration-validation"></a> Debug Configuration Validations

The following validation checks are performed when running an `aws-sam` Debug Configuration

-   does the referenced SAM template file exist
-   does the referenced SAM Template resource exist
-   is the referenced SAM Template resource a supported type (for example, a Lambda function)
-   is the lambda function runtime supported by the Toolkit
-   are there any environment variables do not exist in the SAM Template? (these surface to the user as warnings, and don't stop the debug session)

### <a id="eligible-lambda-handler"></a> What is an eligible Lambda Handler

Functions considered by the Toolkit to be eligible Lambda Handlers:

Python:

-   Top level functions

Javascript:

-   exported functions with 3 or fewer parameters

C#:

-   public functions within public classes
