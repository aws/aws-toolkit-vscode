# User Experience: Local Debugging SAM Applications

Current Status: **Accepted, Not Implemented**

## <a id="introduction"></a> Introduction

The AWS Toolkit for Visual Studio Code (toolkit) enhances the Serverless Application Model (SAM) Application development experience by integrating local debug functionality into Visual Studio Code (VS Code). This document outlines the user experience.

While this document's main focus is on debugging capabilities in the toolkit, the experience around invoking without the debugger (aka "running") is also discussed.

Each programming language (and its corresponding Lambda Runtime(s)) requires Toolkit support for debugging features to work. As of v1.7.0 (Feb 2020), the following languages and runtimes are supported:

-   javascript (nodejs10.x, nodejs12.x)
-   python (python2.7, python3.6, python3.7, python3.8)
-   C# (dotnetcore2.1)

## Overview

The toolkit supports the following scenarios for Locally Running and Debugging code using the Serverless Application Model:

-   users can locally invoke [SAM Template](#terms-sam-template) resources that are Lambda functions
-   users can locally invoke Lambda function handler code independent of templates
-   in the future, users will be able to locally trigger API Gateway style SAM Template resources that are Lambda functions (design is TBD)

## What can be Debugged Locally

### Lambda Functions Invoked Directly

Users can directly invoke Lambda functions and debug them locally.

Lambda functions can be invoked in the context of a Serverless Application. CloudFormation template resources of the type [`AWS::Lambda::Function`](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-function.html) or [`AWS::Serverless::Function`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-resource-function.html) represent Lambda functions. The toolkit provides ways to invoke these resources.

Lambda functions can also be invoked directly from code, without any CloudFormation or SAM Templates. This gives users a way to quickly iterate and experiment with Lambda code that may or may not be integrated into CloudFormation Templates, SAM Templates, or some other Infrastructure as Code technologies.

### Lambda Functions Invoked via API Gateway

SAM Template resources that contain an event of type [Api](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-function-api.html) can be locally hosted in a web server for development and iteration. When users make REST requests to the web server, the Lambda function receives an API Gateway based event.

At this time, an experience for API Gateway support has not been designed.

## <a id="debug-config"></a> What can be configured for a Debug session?

The following properties influence a debug session. These are user-configured, and are referenced by the various [debugging experiences](#debugging-experiences).

### General

| Property                | Description                                                                                                                                                                                  | Source when invoking Template Resources    | Source when invoking code |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------- |
| Environment Variables   | Environment Variables exposed to the Lambda Function                                                                                                                                         | Debug Configuration first, Template second | Debug Configuration       |
| Input Event             | Payload passed to the invoked Lambda Function                                                                                                                                                | Debug Configuration                        | Debug Configuration       |
| SAM Template Parameters | Values to use for [Parameters](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/parameters-section-structure.html) in a SAM Template - Only applicable when invoking Resources | Debug Configuration                        | Not Applicable            |
| Runtime                 | Runtime of Lambda Function to invoke                                                                                                                                                         | Template                                   | Debug Configuration       |
| Handler                 | Lambda Function handler to invoke                                                                                                                                                            | Template                                   | Debug Configuration       |
| Timeout                 | Timeout threshold for Lambda function                                                                                                                                                        | Template                                   | Debug Configuration       |
| Memory                  | Memory provided to Lambda function                                                                                                                                                           | Template                                   | Debug Configuration       |

### SAM CLI

SAM CLI related properties affect how the application is built and launched. For reference see the [sam build](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html) command.

| Property                     | Description                                                                                                                                                                                                                      | Default Value                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Build SAM App in container   | Supports cases where dependencies have natively compiled dependencies (See [use-container](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html))             | false                            |
| Skip new image check         | Skips checking/downloading the latest Lambda Runtime Docker images every invoke (See [skip-pull-image](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html)) | false                            |
| Use a docker network         | Connects invoked SAM App to a Docker network (See [docker-network](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html))                                     | empty string (no docker network) |
| Additional build args        | These are passed along to `sam build` calls                                                                                                                                                                                      | empty string                     |
| Additional local invoke args | These are passed along to `sam local` calls                                                                                                                                                                                      | empty string                     |

### AWS

When provided, AWS properties are injected into local Lambda containers running the invoked SAM Application. This is useful in scenarios where the Lambda running locally is accessing other AWS resources.

| Property    | Description                                                                                                                                                        | Default Value                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Credentials | Provides credentials to the Lambda function being invoked. Set this to the Credentials ID as shown in the Credentials selection list (example: `profile:default`). | The Toolkit's active credentials are used. No credentials are provided to the local Lambda container if the user is not connected to AWS. |
| Region      | Region assumed by the local Lambda container                                                                                                                       | The active credentials' default region (if available), else us-east-1                                                                     |

## <a id="debugging-experiences"></a> Local Debugging Experiences

### <a id="debug-configurations"></a> Debug Configurations

[Debug Configurations](#terms-debug-configuration) are the idiomatic approach to running and debugging software in VS Code. They are also a reusable component - the Toolkit is able to internally produce and execute these configurations on the fly. This is the Toolkit's main experience for debugging SAM Template resources.

The Toolkit provides a Debug Configuration type `aws-sam`. Users author and maintain these configuration entries. When users launch a debug configuration of type `aws-sam`, the toolkit performs the following:

1.  the debug configuration is validated (see [Debug Configuration Validations](#debug-configuration-validation)). The launch is stopped if errors are detected.
1.  a SAM Application's code is built
1.  a SAM Template resource is invoked
1.  a debugger is attached to the invoked resource (this is skipped if the debug configuration was launched using "Run without Debugging")
    -   debug output is shown in the Debug Console of VS Code during this Debug Session

The Debug Console can only be written to when VS Code has an active debug session. During the launch sequence, launch progress is written to the Toolkit's Output Channel until a debugger is attached. SAM CLI commands executed by the Toolkit are written to the Output Channel, so users can see what is happening behind the scenes.

Debug configurations reside in a JSON file. The Toolkit assists users working with `aws-sam` entries in the following ways:

-   users see autocompletion for `aws-sam` related fields
    -   autocompletion is not available for open ended configuration values. For example, when a user types in the location of a SAM Template file, there is no filesystem-based autocompletion. The toolkit validates `aws-sam` debug configurations when launched, and notifies users as errant values are detected.
-   users see field descriptions (tooltips) for `aws-sam` related fields
-   users have access to snippets that produce typical (or starter) `aws-sam` debug configurations
-   the toolkit is capable of generating an `aws-sam` Debug Configuration for all `AWS::Serverless::Function` and `AWS::Lambda::Function` resources detected within a workspace
    -   when users create a new SAM Application, the toolkit automatically performs this step to produce initial Debug Configurations

Example Debug Configuration entries can be found in the [Appendix](#sample-debug-configurations).

### <a id="codelenses"></a> CodeLenses

The Toolkit uses [CodeLenses](#terms-codelenses) as a way of setting up a [Debug Configuration](#debug-configurations) of type `aws-sam`.

Some users find CodeLenses visually distracting. Other users use the Toolkit for features that aren't related to local debugging. The Toolkit's CodeLenses are enabled by default, but can be disabled in the Toolkit settings.

The CodeLenses discussed below only appear for languages/runtimes that the Toolkit provides support for (see [Introduction](#introduction)).

#### CodeLenses in SAM Template files

The Toolkit offers a way for users to set up debug configurations for template resources of type `AWS::Serverless::Function` and `AWS::Lambda::Function`.

The Toolkit adds an "Add Debug Configuration" CodeLens above resources that are not already referenced by a debug configuration. When users click this CodeLens, the toolkit produces a Debug Configuration of type `aws-sam`, configures it to invoke the resource, and adds it to `launch.json`. Users are taken to the new entry in `launch.json`.

#### CodeLenses in Code files

The Toolkit offers a way for users to set up debug configurations that can launch functions considered [eligible Lambda handlers](#eligible-lambda-handler).

The Toolkit adds an "Add Debug Configuration" CodeLens above lambda handers that are not already referenced by a debug configuration. When users click this CodeLens, the toolkit produces a Debug Configuration of type `aws-sam`, configures it to invoke the lambda handler, and adds it to `launch.json`. Users are taken to the new entry in `launch.json`.

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

The debug capabilities initially released in the Toolkit were not well rounded. CodeLenses provided the only means of local debugging, and did not have a well defined design around what was being debugged. Because the Toolkit lacked a way to directly invoke/debug SAM Template resources, these CodeLenses tried to compensate, leading to scenarios with undefined behaviors. Many of these issues are referenced from https://github.com/aws/aws-toolkit-vscode/issues/758

Here is an outline of the differences between this design and the current version of the AWS Toolkit:

-   New functionality
    -   `aws-sam` Debug Configurations provide a way to launch debug sessions that articulate what is being debugged
    -   Added CodeLenses to help users to produce Debug Configurations
-   Removed functionality
    -   Using CodeLenses as a mechanism to launch debug sessions will be removed. Users familiar with the outgoing functionality are provided with an assisted transition path towards using Debug Configurations.
        -   the toolkit detects if users were using the previous CodeLens functionality based on the presence of a CodeLens configuration file (`{workspace}/.aws/templates.json`). For these users, lambda handlers that used to show Run/Debug CodeLenses will be decorated to mention the functionality shift, and will offer to convert the function's old CodeLens configuration over to a new debug configuration.

### <a id="sample-debug-configurations"></a> Sample Debug Configurations

Configuration structures are modelled so that they group related parameters, and allows the toolkit to reuse structure types where possible.

Here is an example Debug Configuration to debug a SAM Template resource called "HelloWorldResource".
The required fields are: type, request, invokeTarget

```jsonc
{
    "configurations": [
        {
            "name": "Debug HelloWorldResource", // Users name the entry; shown in Debug dropdown
            "type": "aws-sam",
            // direct-invoke is the "aws-sam" variation for debugging SAM Template resources and Lambda handlers
            "request": "direct-invoke",
            // Reference to the thing (Template or Code) being invoked
            "invokeTarget": {
                "target": "template", // template | code, influences fields expected by toolkit
                "samTemplatePath": "path to template yaml file",
                "samTemplateResource": "HelloWorldResource" // Name of Template resource to debug
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
            // SAM Template and SAM CLI related arguments
            "sam": {
                "containerBuild": false,
                "skipNewImageCheck": false,
                "dockerNetwork": "aaaaa",
                "buildArguments": "--foo",
                "localArguments": "--foo",
                // used when invokeTarget references a SAM Template
                "template": {
                    // SAM Template Parameter substitutions
                    "parameters": {
                        "param1": "somevalue"
                    }
                }
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

Here is an example Debug Configuration to directly invoke and debug a Lambda handler function.
The variation to directly invoke a function instead of a template resource is defined by the `invokeTarget.target` field. The differences are the fields within `invokeTarget`, an extended `lambda` structure, and no `sam.template` object.

The required fields are: type, request, invokeTarget, lambda.runtime

```jsonc
{
    "configurations": [
        {
            "name": "Debug Lambda Handler MyFunctionHandler", // Users name the entry; shown in Debug dropdown
            "type": "aws-sam",
            // direct-invoke is the "aws-sam" variation for debugging SAM Template resources and Lambda handlers
            "request": "direct-invoke",
            // Reference to the thing (Template or Code) being invoked
            "invokeTarget": {
                "target": "code", // template | code, influences fields expected by toolkit
                // projectRoot - The top level folder to run the Lambda handler in
                // (this affects the lambdaHandler field in runtimes like node and python).
                "projectRoot": "path to folder",
                // lambdaHandler - C# example shown. nodeJs example: app.lambdaHandler
                "lambdaHandler": "HelloWorld::HelloWorld.Function::MyFunctionHandler"
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
            // SAM Template and SAM CLI related arguments
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

The Toolkit performs the following validation checks when launching an `aws-sam` Debug Configuration:

-   Errors (launch is stopped, user is informed):

    -   required fields are missing from the debug configuration
    -   the referenced SAM template file does not exist
    -   the referenced SAM Template resource does not exist
    -   the referenced SAM Template resource is not a supported type (for example, isn't a Lambda function)
    -   the lambda function runtime is not supported by the Toolkit

-   Warnings (launch is not stopped, user is informed):
    -   environment variables that are defined in the debug configuration, but do not exist in the SAM Template

### <a id="eligible-lambda-handler"></a> What is an eligible Lambda Handler

Functions considered by the Toolkit to be eligible Lambda Handlers:

Python:

-   Top level functions

Javascript:

-   exported functions with 3 or fewer parameters

C#:

-   public functions within public classes

### Comparison to other AWS Toolkits

#### AWS Toolkit for JetBrains

This toolkit has comparable debugging functionality overall.

Instead of Debug Configurations, the toolkit has run configurations. The run configurations allow users to reference a lambda handler directly, or a SAM Template resource.

Instead of CodeLenses, the toolkit has gutter icons that appear to the right of relevant functions and template resources. These gutter icons allow users to create new Run Configurations.

#### AWS Toolkit for Visual Studio

This toolkit has no support for local SAM Debugging.

### Future Considerations

Functionality not currently planned, but could be evaluated based on feasibility, interest, and usage patterns.

-   **Go to Definition style Referencing** - provide an in-editor approach to jump between a Template Resource and the Lambda handler code
-   **Intelligent Rename** - when renaming a Lambda hander function, propagate changes to any Debug Configurations and Template resources that reference the function
-   **Support for SAM CLI Config** - ([Reference](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-config.html)) could certain invoke behaviors be defined more consistently?
