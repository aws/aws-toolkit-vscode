# Local Debugging Experience for SAM Applications

Current Proposal Stage: General Experience

Future Proposal Stages (as future PRs):

-   General Experience In-depth
-   Architecture

Previous Proposal Stages:

-   None

## Introduction

TODO : Intro

While this document's main focus is on debugging capabilities in the toolkit, there are places where the experience around invoking without the debugger (aka "running") is also discussed.

TODO : A limited selection of programming languages are supported in the Toolkit.

### Terminology

TODO : Fill this section

#### CodeLens

CodeLenses are visual decorators anchored to a document location. They are used to convey information and/or provide links that trigger an action. They are a presentation-only mechanic and do not reside within a file. Additional information and examples about CodeLenses can be found [on the VS Code blog](https://code.visualstudio.com/blogs/2017/02/12/code-lens-roundup).

#### Debug Configuration

Debug Configurations are JSON entries within the `.vscode/launch.json` file optionally located in each VS Code workspace. These are user managed, defining what programs can be debugged. Presing F5 (or the Debug button) starts a Debugging session for the currently selected Debug Configuration. VS Code extensions can provide and implement Debug Configuration types in addition to those available in VS Code.

More information about VS Code Debugging can be found [in the VS Code Documentation](https://code.visualstudio.com/docs/editor/debugging).

#### SAM Template

A SAM Template defines a Serverless Application's resources, and supporting code. This is used by the SAM CLI to build, run, package, and deploy the Application.

Additional information about SAM can be found at:

-   [SAM Homepage](https://aws.amazon.com/serverless/sam/)
-   [What Is the AWS Serverless Application Model (AWS SAM)?](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
-   [SAM CLI GitHub Repo](https://github.com/awslabs/aws-sam-cli)

## Overview

The following scenarios are supported for Locally Running and Debugging with the Serverless Application Model:

-   Invoking SAM Template Lambda Function Resources
-   API Gateway requests against SAM Template Lambda Function Resources
-   Invoking standalone Lambda Function Handlers
-   API Gateway requests against standalone Lambda Function Handlers

---

Users can Locally Debug SAM Applications in the following ways:

-   Debug Configurations - Launch a Debugging session using the Debug Panel in VS Code and pressing F5.
-   Local SAM Templates View - One UI Location to see and act on all SAM Applications / Functions
-   CodeLenses on Lambda Handlers - Locally run and debug a Lambda handler function without any SAM Template associations

## What can be Debugged Locally

### SAM Template Resources

SAM Template Resources of type `AWS::Serverless::Function` represent Lambda functions. The corresponding Lambda function code (if present) can be locally Run or Debugged. The SAM CLI is used to invoke the Lambda function similar to how it is run in the cloud, and a debugger can be attached to the Lambda function code.

If the SAM Template Resource contains an event of type [Api](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-function-api.html), the SAM CLI can also be used to invoke the Lambda function in a manner similar to how they are invoked through API Gateway.

### Standalone Lambda Function Handlers

Lambda Function Handler code can be locally Run or Debugged, even if it does not belong to a SAM Application. A temporary SAM Application is produced behind the scenes to contain the handler of interest, and the SAM CLI is used to invoke the Lambda function, as outlined in SAM Template Resources. Afterwards, the temporary SAM Application is removed.

In this mode, any SAM Templates that a Handler is associated with are ignored. This prevents confusion/errors introduced when trying to resolve between SAM Template Resource handlers with code (examples include incorrectly determining a function's lambda handler string, or situations where more than one resource references the same function).

The Toolkit does not provide support for locally running or debugging standalone Lambda function handlers in a manner emulating API Gateway. The code should be referenced from a SAM Template to use the API Gateway style debugging mentioned in the earlier section.

## What can be configured for a Debug session?

The following parameters influence a debug seession.

| Property                | Description                                          | Used by Standalone Lambda Handler | Used by SAM Template Resources |
| ----------------------- | ---------------------------------------------------- | --------------------------------- | ------------------------------ |
| SAM Template            | Path to SAM Template file                            |                                   | x                              |
| SAM Template Resource   | Name of resource within SAM Template                 |                                   | x                              |
| SAM Template Parameters | Values to use for SAM Template Parameters            |                                   | x                              |
| Environment Variables   | Environment Variables exposed to the Lambda Function | x                                 | x                              |
| Input Event             | Payload passed to the invoked Lambda Function        | x                                 | x                              |
| Runtime                 | Runtime of Lambda Function to invoke                 | x                                 |                                |
| Handler                 | Lambda Function Handler to invoke                    | x                                 |                                |
| Timeout                 | Timeout threshold for Lambda function                | x                                 |                                |
| Memory                  | Memory provided to Lambda function                   | x                                 |                                |

The following SAM CLI related arguments are relevant to debugging both standalone lambda function handlers and sam template resources. For reference see the [sam build](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html) command.

| Property                                                         | Default Value                    |
| ---------------------------------------------------------------- | -------------------------------- |
| Build SAM App in container                                       | false                            |
| Skip new image check                                             | false                            |
| use a docker network                                             | empty string (no docker network) |
| additional build args (passed along to `sam build` calls)        | empty string                     |
| additional local invoke args (passed along to `sam local` calls) | empty string                     |

The following AWS related arguments are relevant to debugging both standalone lambda function handlers and sam template resources:

-   Credentials
-   Region

## Local Debugging Experiences

CC: what is/isn't supported, and what it looks like for each experience

### Debug Configurations

The Toolkit implements a Debug Configuration type `aws-sam`. When run, this configuration type:

-   validates debug configuration inputs
-   uses SAM CLI to build a SAM Application
-   uses SAM CLI to invoke a SAM Template Resource
-   attaches a debugger to the SAM invocation
-   if the debug configuration is for a local api gateway invoke, the debugger is detached after the http request is made, but SAM CLI remains active. The debug configuration implementation terminates the SAM CLI session to prevent a proliferation of CLI processes.

In the most basic form, the debug configuration references a SAM Template file location, and a Resource within that file. Other execution parameters can be configured, but are optional.

Debugging local lambda invokes and local api gateway invokes each require slightly different inputs. The `aws-sam` Debug Configuration uses different request types to accommodate these variations.

These debug configurations are authored in a json file. The toolkit assists with this as follows:

-   autocompletion with descriptions is provided for `aws-sam` related fields
    -   There is no autocompletion available for specific values in a configuration. For example, if a user types in the location of a SAM Template file, there is no filesystem-based autocompletion. The Debug Configuration validates the configuration and notifies of errant values when it is run.
-   snippets to produce typical (or starter) `aws-sam` debug configurations
-   when no launch.json file is present in a workspace, VS Code exposes functionality that allows users to request auto-generated Debug Configurations. In this situation, the toolkit generates an `aws-sam` Debug Configuration for all `AWS::Serverless::Function` Resources detected within all SAM Templates located in the workspace.

Example Debug Configuration entries can be found in the Appendix - Sample Debug Configurations

Debug Configurations are the idiomatic approach to running and debugging software in VS Code. They are also a reusable component - the Toolkit generates and executes these at runtime to trigger debug sessions (CodeLenses is one example of this). Debug Configurations are the main experience for debugging SAM Template resources in the Toolkit.

Standalone Lambda function handlers are not supported through Debug Configurations.

### CodeLenses

Toolkit settings can be used to enable and disable CodeLenses.
CodeLenses only appear for languages/runtimes that the Toolkit has implemented Debug support for.

#### CodeLenses in SAM Template files

The following CodeLenses appear above every template resource of type `AWS::Serverless::Function`:

-   Run Locally - See below for details
-   Debug Locally - See below for details
-   Configure - allows the user to configure a limited set of arguments that are used with the Run and Debug CodeLenses
    -   Anything that can be defined by the SAM Template would not be configurable in here
    -   This covers aspects like input event, and SAM CLI related arguments
-   Add Debug Configuration - Utility feature to produce a skeleton Debug Configuration in `launch.json` for users

When clicked, the Run and Debug CodeLenses locally invoke their associated Template Resource. The following takes place:

-   The SAM Application is built
-   The associated SAM Template resource is invoked, using configurations set with the Configure CodeLens
-   (If the Debug CodeLens was clicked) The VS Code debugger is attached to the invoked resource

When clicked, the Configure CodeLens opens a (JSON) configuration file that resides in the workspace and is managed by the Toolkit. The configuration file is used for each SAM Template Resource within the workspace. Users have autocompletion support with this file. A rich UI is not considered at this time, but the door remains open to adding a visual editor in the future based on user feedback.

The Run and Debug CodeLenses perform a regular local invoke on a resource. These CodeLenses do not perform API Gateway style invokes.

#### CodeLenses in Code files

CodeLenses in code files provides support for debugging Standalone Lambda function handlers.

The following CodeLenses appear over any function that appears to be an eligible Lambda Handler:

-   Run Locally - See below for details
-   Debug Locally - See below for details
-   Configure - allows the user to configure arguments that are used with the Run and Debug CodeLenses (see What can be configured for a Debug session?)

When clicked, the Run and Debug CodeLenses locally invoke the Lambda handler function they represent. These Lambda handlers are invoked independent of SAM Templates that exist in the users workspace. The following takes place:

-   A temporary SAM Template is produced, which contains one resource that references the Lambda handler
-   The temporary SAM Application is built
-   The resource in the temporary SAM Template is invoked, using configurations set with the Configure CodeLens
-   (If the Debug CodeLens was clicked) The VS Code debugger is attached to the invoked resource

When clicked, the Configure CodeLens opens a (JSON) configuration file that resides in the workspace and is managed by the Toolkit. All standalone handlers within a workspace will have their configurations stored in this file. Users have autocompletion support with this file. A rich UI is not considered at this time, but the door remains open to adding a visual editor in the future based on user feedback.

These CodeLenses do not perform API Gateway style invokes.

Some users may find CodeLenses within code files distracting, particularly if they are using the Toolkit for features not related to local debugging. Toolkit settings can be used to enable and disable CodeLenses.

### User Interface

A UI is provided to support API Gateway based local debugging of SAM Template Resources. The view resembles a simple REST request workbench. After selecting a SAM Template, and a resource from that template, users craft a REST request (GET, POST, ect, as well as query string and body). Submitting the request (through a Run or Debug button) performs the following:

-   build the SAM Application
-   invoke the SAM Template Resource in api gateway mode
-   send the REST request to the invoked SAM application
-   (if debugging)
    -   attach a debugger to the invoked SAM application
    -   once the lambda handler exits, the debug session ends. The Toolkit terminates the invoked SAM application
-   (if running)
    -   once a response is received, the toolkit terminates the invoked SAM application
-   The request, response, response code, and sam cli output are output to the toolkit's OutputChannel

Users have the option to customize the SAM invocation in the same way as CodeLenses in SAM Template files.

## Appendix

### Differences between this doc and v1.0.0 of Toolkit

-   Lambda Handlers no longer associated with SAM Templates
-   api gateway support
-   Debug Configuration support

### Sample Debug Configurations

Here is an example Debug Configuration to debug a SAM Template Resource called "HelloWorldResource".
The only required fields are: type, request, samTemplate.path, samTemplate.resource

```json
{
    "configurations": [
        {
            "name": "Debug HelloWorldResource",
            "type": "aws-sam",
            "request": "template-invoke", // This is the "aws-sam" variation for debugging SAM Template Resources
            "samTemplate": {
                "path": "path to template yaml file",
                "resource": "HelloWorldResource", // Name of Template Resource to debug
                // SAM Template Parameter substitutions
                "parameters": {
                    "param1": "somevalue"
                }
            },
            // Environment Variables accessible by Lambda Handler
            "environmentVariables": {
                "envvar1": "somevalue",
                "envvar2": "..."
            },
            // The event passed to the Lambda Handler (defaults to an empty JSON object)
            "event": {
                // path or json, not both
                "path": "somepath", // Path to event data
                "json": {
                    // event data
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

Here is an example Debug Configuration to debug an API Gateway invoked SAM Template Resource called "HelloWorldResource".
The variation is defined by the `request` field, and the only difference is in the event field.
The only required fields are: type, request, samTemplate.path, samTemplate.resource

```json
{
    "configurations": [
        {
            "name": "a2",
            "type": "aws-sam",
            "request": "template-api", // This is the "aws-sam" variation for debugging API Gateway invoked SAM Template Resources
            "samTemplate": {
                "path": "some path",
                "resource": "HelloWorldResource",
                "parameters": {
                    "param1": "somevalue"
                }
            },
            "environmentVariables": {
                "envvar1": "somevalue",
                "envvar2": "..."
            },
            // The API call made to the Handler once invoked
            "event": {
                "api": {
                    "path": "/bee",
                    "method": "get",
                    "query": "aaa=1&bbb=2",
                    "body": "text - can we do this?"
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
