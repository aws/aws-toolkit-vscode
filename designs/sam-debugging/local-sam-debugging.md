# Local Debugging Experience for SAM Applications

Current Status: Not Implemented

## Introduction

The AWS Toolkit enhances the SAM Application development experience by integrating local debug functionality into VS Code. This document outlines the available functionality.

While this document's main focus is on debugging capabilities in the toolkit, there are places where the experience around invoking without the debugger (aka "running") is also discussed.

Each programming language (and corresponding Lambda Runtimes) requires Toolkit support for debugging features to work. A limited selection of programming languages are supported in the Toolkit.

### Terminology

#### CodeLens

CodeLenses are visual decorators anchored to document locations. They are used to convey information and/or provide links that trigger an action. Additional information and examples about CodeLenses can be found [on the VS Code blog](https://code.visualstudio.com/blogs/2017/02/12/code-lens-roundup).

#### Debug Configuration

Debug Configurations are user-managed JSON entries that define what programs can be debugged. Pressing F5 (or the Debug button) starts a Debug session for the Debug Configuration currently selected in VS Code's Debug View. VS Code extensions increase VS Code's debugging capablities by implementing Debug Configuration types.

Debug Configurations are stored in `.vscode/launch.json` relative to the VS Code workspace.

More information about VS Code Debugging can be found [in the VS Code Documentation](https://code.visualstudio.com/docs/editor/debugging).

#### SAM Template

A SAM Template defines a Serverless Application's resources, and supporting code. This is used by the SAM CLI to build, run, package, and deploy the Application.

Additional information about SAM can be found at:

-   [SAM Homepage](https://aws.amazon.com/serverless/sam/)
-   [What Is the AWS Serverless Application Model (AWS SAM)?](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
-   [SAM CLI GitHub Repo](https://github.com/awslabs/aws-sam-cli)

## Overview

The toolkit supports the following scenarios for Locally Running and Debugging code using the Serverless Application Model:

-   invoking SAM Template resources that are Lambda functions
-   making API Gateway style requests against SAM Template resources that are Lambda functions
-   invoking standalone Lambda function handlers (these don't use SAM Templates, but the debugging functionality is supported by one behind the scenes)

Each scenario has one or more relevant user experiences. The different debugging functionalities are discussed first. Then, the various user experiences are discussed, along with which scenarios they apply to.

## What can be Debugged Locally

### <a id="sam-template-resource-local"></a> SAM Template Resources (Local Invoke)

SAM Template resources of type [`AWS::Serverless::Function`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-resource-function.html) represent Lambda functions. Lambda function code referenced by these resources can be locally Run or Debugged. The Toolkit uses SAM CLI to invoke the Lambda function, emulating how the function is run on AWS. A debugger can be attached to the invoked Lambda function code, and the event passed into the Lambda function can be customized.

### <a id="sam-template-resource-api-gateway"></a> SAM Template Resources (API Gateway style Local Invoke)

SAM Template resources that contain an event of type [Api](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-function-api.html), can be hosted in a web server for local development and iteration. A REST request causes the Lambda function to receive an API Gateway based event.

At this time, an experience for API Gateway support is not available. Some portions of this document (Debug Configurations for example) have considerations made for supporting API Gateway functionality.

### Standalone Lambda Function Handlers

Lambda function handler code can be locally Run or Debugged, even if it does not belong to a SAM Application. The Toolkit produces a temporary SAM Application to contain the handler code. This temporary SAM Application is handled as mentioned [earlier](#sam-template-resource-local). At the end of the debug session, the temporary SAM Application is removed.

In this mode, any SAM Templates that reference a handler are ignored. This prevents confusion/errors introduced when trying to perform a reverse-lookup between code and SAM Template resources (examples include incorrectly determining a function's Lambda handler string, or situations where more than one resource references the same function).

The Toolkit does not provide support for locally running or debugging standalone Lambda function handlers as API Gateway calls. The code should be referenced from a SAM Template in order to use the API Gateway style debugging features mentioned in the earlier section.

## <a id="debug-config"></a> What can be configured for a Debug session?

The following parameters influence a debug session. These are user-configured, and are referenced by the various [debugging experiences](#debugging-experiences).

| Property                | Description                                                | Used by Standalone Lambda Handler | Used by SAM Template Resources |
| ----------------------- | ---------------------------------------------------------- | --------------------------------- | ------------------------------ |
| SAM Template            | Path to SAM Template file                                  |                                   | ✅                             |
| SAM Template Resource   | Name of lambda function-based resource within SAM Template |                                   | ✅                             |
| SAM Template Parameters | Values to use for SAM Template Parameters                  |                                   | ✅                             |
| Environment Variables   | Environment Variables exposed to the Lambda Function       | ✅                                | ✅                             |
| Input Event             | Payload passed to the invoked Lambda Function              | ✅                                | ✅                             |
| Runtime                 | Runtime of Lambda Function to invoke                       | ✅                                | obtained from SAM Template     |
| Handler                 | Lambda Function handler to invoke                          | ✅                                | obtained from SAM Template     |
| Timeout                 | Timeout threshold for Lambda function                      | ✅                                | obtained from SAM Template     |
| Memory                  | Memory provided to Lambda function                         | ✅                                | obtained from SAM Template     |

The following SAM CLI related arguments are relevant to debugging both standalone lambda function handlers and sam template resources. For reference see the [sam build](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html) command.

| Property                                                         | Description                                                                                                                                                                                                                      | Default Value                    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Build SAM App in container                                       | Supports cases where dependencies have natively compiled dependencies (See [use-container](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html))             | false                            |
| Skip new image check                                             | Skips checking/downloading the latest Lambda Runtime Docker images every invoke (See [skip-pull-image](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html)) | false                            |
| use a docker network                                             | Connects invoked SAM App to a Docker network (See [docker-network](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html))                                     | empty string (no docker network) |
| additional build args (passed along to `sam build` calls)        |                                                                                                                                                                                                                                  | empty string                     |
| additional local invoke args (passed along to `sam local` calls) |                                                                                                                                                                                                                                  | empty string                     |

The following AWS related arguments are relevant to debugging both standalone lambda function handlers and sam template resources. When provided, they are injected into the local Lambda containers running the invoked SAM Application. This is useful in scenarios where the Lambda running locally is accessing other AWS resources.

-   Credentials - Set this to the Credentials ID as shown in the Credentials selection list (example: `profile:default`). If this is omitted, the Toolkit's active credentials are used.
-   Region - Set this to the region code (eg: `us-east-1`)

## <a id="debugging-experiences"></a> Local Debugging Experiences

### <a id="debug-configurations"></a> Debug Configurations

Debug Configurations are the idiomatic approach to running and debugging software in VS Code. They are also a reusable component - the Toolkit is able to internally produce and execute these configurations on the fly (for example as a part of the [CodeLenses](#codelenses) functionality). This is the Toolkit's main experience for debugging SAM Template resources.

The Toolkit implements a Debug Configuration type `aws-sam`. Users can author and maintain these configuration entries, then launch them by pressing F5 (or Ctrl+F5 to Run without Debugging). When launched, this configuration type:

-   validates debug configuration inputs (see [Debug Configuration Validations](#debug-configuration-validation))
-   uses SAM CLI to build a SAM Application
-   uses SAM CLI to invoke a SAM Template resource
-   attaches a debugger to the SAM invocation (skipped if "Run without Debugging" was used)

In the most basic form, the debug configuration references a SAM Template file location, and a resource within that file. Other execution parameters can be configured, but are optional.

Debugging local lambda invokes and local api gateway invokes each require slightly different inputs. The `aws-sam` Debug Configuration uses different request types to accommodate these variations.

These debug configurations are authored in a json file. The following Toolkit assistance is provided:

-   autocompletion with descriptions is provided for `aws-sam` related fields
    -   There is no autocompletion available for specific values in a configuration. For example, if a user types in the location of a SAM Template file, there is no filesystem-based autocompletion. The Debug Configuration validates the configuration and notifies of errant values when it is run.
-   snippets to produce typical (or starter) `aws-sam` debug configurations
-   when no launch.json file is present in a workspace, VS Code exposes functionality that allows users to request auto-generated Debug Configurations. In this situation, the toolkit generates an `aws-sam` Debug Configuration for all `AWS::Serverless::Function` resources detected within all SAM Templates located in the workspace.

Example Debug Configuration entries can be found in the [Appendix](#sample-debug-configurations)

Standalone Lambda function handlers are not supported through Debug Configurations.

### <a id="codelenses"></a> CodeLenses

#### CodeLenses in SAM Template files

CodeLenses are added to SAM Template files that serve as shortcuts to any [debug configurations](#debug-configurations) defined in the workspace.

Every Debug Configuration that references a SAM Template and resource pairing will produce a CodeLens above that resource. When clicked, these CodeLenses launch the corresponding debug session, as if the user selected that debug configuration and pressed Debug from VS Code's Debug view.

An additional CodeLens is placed above every template resource of type `AWS::Serverless::Function` called "Add Debug Configuration". Clicking this CodeLens produces a pre-filled `aws-sam` Debug Configuration in `launch.json` capable of performing a [local invoke](#sam-template-resource-local) of the associated resource.

#### CodeLenses in Code files

CodeLenses in code files provide support for debugging standalone Lambda function handlers.

The following CodeLenses appear over any function that appears to be an eligible Lambda handler: Run Locally, Debug Locally, Configure.

The Configure CodeLens allows users to customize how the function handler is locally debugged. Configuration is optional, using sensible defaults when necessary. The configurable aspects are listed [above](#debug-config). Each handler is configured separately, and all handler configurations are stored in the workspace at `.aws/lambda-handlers.json` ([file structure](#code-file-codelens-config)). Clicking the Configure CodeLens opens this file, adds a configuration entry for the corresponding handler if necessary, and places the cursor at the handler's entry. Users have autocompletion support in this file. A rich UI for configuration is not considered at this time, but the door remains open to adding a visual editor in the future based on user feedback.

When clicked, the Run and Debug CodeLenses locally invoke their associated Lambda handler function. These Lambda handlers are invoked independently of SAM Templates that exist in the users workspace. The Toolkit performs the following:

-   A temporary SAM Template is produced, containing one resource that references the Lambda handler
-   The temporary SAM Application is built. Where applicable, settings are applied from the configurations speficied with the Configure CodeLens.
-   The resource in the temporary SAM Template is invoked. Where applicable, settings are applied from the configurations speficied with the Configure CodeLens.
-   (If the Debug CodeLens was clicked) The VS Code debugger is attached to the invoked resource
-   SAM CLI output is shown in the Toolkit's Output Channel. If a debugger is attached, output is also shown in the Debug Console.

These CodeLenses do not support API Gateway style invokes.

Some users may find CodeLenses within code files distracting, particularly if they are using the Toolkit for features not related to local debugging. Toolkit settings can be used to enable and disable CodeLenses. CodeLenses only appear for languages/runtimes that the Toolkit has implemented Debug support for.

## Appendix

### Differences from v1.0.0 of AWS Toolkit

The debug capabilities initially released in the Toolkit were not well rounded. CodeLenses provided the only means of local debugging, and without a way to directly debug SAM Template resources these CodeLenses tried to compensate, leading to scenarios with undefined behaviors. Many of the issues are referenced from https://github.com/aws/aws-toolkit-vscode/issues/758

Here is an outline of the differences between this design and version 1.0.0 of the AWS Toolkit:

-   Changed functionality
    -   CodeLenses on code files invoke the function in isolation, and no longer attempt to associate the function with a SAM Template
        -   This change may surprise existing users. There is a high likelihood that they will prefer using F5 to debug their SAM Applications instead of searching for the CodeLenses. To mitigate this change, we have the following strategies:
            -   publicize the change (through a PR of this document)
            -   ensure the changelog entry suitably explains the impact when the change is made
            -   update the user docs
            -   describe behavior explicitly where appropriate ( for example, in tooltips)
    -   CodeLens configurations have a new location and structure
-   New functionality
    -   `aws-sam` Debug Configurations provide a new way to launch debug sessions against SAM Template resources
    -   CodeLenses on SAM Template files
    -   API Gateway related debugging (TBD)
-   Removed functionality
    -   None

### <a id="sample-debug-configurations"></a> Sample Debug Configurations

Here is an example Debug Configuration to debug a SAM Template resource called "HelloWorldResource".
The only required fields are: type, request, samTemplate.path, samTemplate.resource

```jsonc
{
    "configurations": [
        {
            "name": "Debug HelloWorldResource",
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

### <a id="code-file-codelens-config"></a> Sample Code file CodeLens Configuration

The configuration file for debugging standalone lambda function handlers is located in the workspace at `.aws/lambda-handlers.json`. Here is a sample configuration file.

```jsonc
{
    "configurations": {
        // Keys are code file paths relative to workspace
        "src/foo.js": {
            // Keys are function names
            "lambdaHandler": {
                // Lambda Execution related arguments
                "lambda": {
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
            },
            "handler2": {
                // and so on...
            }
        },
        "src/processors.js": {
            // and so on...
        }
    }
}
```

### <a id="debug-configuration-validation"></a> Debug Configuration Validations

The following validation checks are performed when running an `aws-sam` Debug Configuration

-   does the referenced SAM template file exist
-   does the referneced SAM Template resource exist
-   is the referneced SAM Template resource a supported type (for example, a Lambda function)
-   is the lambda function runtime supported by the Toolkit
-   are there any environment variables do not exist in the SAM Template? (these surface to the user as warnings, and don't stop the debug session)
