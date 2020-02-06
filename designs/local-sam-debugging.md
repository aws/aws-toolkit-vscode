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

Lambda Function Handler code can be locally Run or Debugged, even if it does not belong to a SAM Application. A temporary SAM Application is produced behind the scenes to contain the handler of interest, and the SAM CLI is used to invoke the Lambda function, similar to the section above. Afterwards, the temporary SAM Application is removed.

In this mode, any SAM Templates that a Handler is associated with are ignored. Functionality provided by the above section accommodates for debugging within the context of a defined SAM Application.

It is not possible to locally run or debug standalone Lambda function handlers in a manner emulating API Gateway. The code should be referenced from a SAM Template to use the API Gateway style debugging mentioned in the earlier section.

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

-   Build SAM App in container
-   Skip new image check
-   use a docker network
-   additional build args (passed along to `sam build` calls)
-   additional local invoke args (passed along to `sam local` calls)

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

Standalone Lambda function handlers are not supported through Debug Configurations.

### User Interface

### CodeLenses

### Serverless Projects Tree

---

## Debug Configurations

Debug Configurations of type `AWS-SAM-Local` can target a resource in a SAM Template, or directly target a Lambda handler in a code file. The Debug Configuration contains enough information to orchestrate a series of SAM CLI calls to build and invoke a SAM Application.

The Debug Configuration is only way to invoke the debugger. All of the local SAM debugging experiences build on this facility.

### Debug Configuration Variants

#### Debug Configurations that target a SAM Template & Resource

This experience is suitable for projects that have already defined their resources in a SAM Template.

When a Debug Configuration targets a resource in a SAM Template, it contains:

-   a path to a SAM Template file
-   the name of a resource within the template.
-   Additional Options Id

The following take place when this debug session is started:

-   the Debug Configuration is validated as follows. Failures prevent the debug session from proceeding:

    -   the SAM Template exists
    -   the Resource exists in the SAM Template
    -   the Resource's Runtime is supported by Toolkit

-   the SAM Application is built from the SAM Tempate
-   the resource's runtime is used to prepare for debugging
    -   Python: The lambda handler is wrapped by another method which starts the VS Code python debugger (ptvsd) and waits for a debugger to attach
    -   dotnetcore: the dotnetcore debugger is installed
-   the referenced SAM Application resource is invoked
-   the appropriate language debugger is connected to the running program

#### Debug Configurations that target a Lambda handler directly

This experience is suitable for prototyping some code before adding it into the SAM Template, or for working with code that does not belong to a SAM Application.

When a Debug Configuration targets a Lambda handler directly, it contains:

-   a path to the file containing the handler
-   a path representing the root of the application
-   a path to the manifest file (eg: `package.json` for Javascript)
-   the name of the handler
    -   JS/Python: this is the function name
    -   dotnetcore: this is the fully qualified assembly name
-   Unknown: Override? the runtime to use
-   Additional Options Id

The following takes place when this debug session is started:

-   the Debug Configuration is validated as follows. Failures prevent the debug session from proceeding:

    -   the code file exists
    -   the manifest file exists
    -   the Resource's Runtime is supported by Toolkit

-   a temporary SAM Application is created, containing a single resource populated by the configuration details
-   the SAM Application is handled in the same manner as above
-   the temporary SAM Application is then disposed

TODO : Unknown : Can we invoke local Run by other means?

### Sample

TODO : Sample SAM Template
TODO : Sample Debug Configuration

TBD Future Proposal Stage:

-   configuring overrides for the template/resource

## OLD

Override

-   Runtime
-   env var
-   event
-   Unknown: Credentials + Region
-   ? root path
-   ? manifest path
-   timeout
-   memory
-   SAM
    -   Unknown: (Sam Template) Parameters
    -   build inside container
    -   skip newer image check
    -   docker network
    -   sam build args
    -   sam local invoke args

---

## Local Debug Arguments

### What is being run

| Property                   | Configured with plain Lambda Invoke | Configured with SAM Template Invoke |
| -------------------------- | ----------------------------------- | ----------------------------------- |
| SAM Template               |                                     | x                                   |
| SAM Template Resource      |                                     | x                                   |
| SAM Template Parameters    |                                     | x                                   |
| Environment Variables      | x                                   | x                                   |
| Input Event (file or json) | x                                   | x                                   |
| Runtime                    | x                                   |                                     |
| Handler                    | x                                   |                                     |
| Timeout                    | x                                   |                                     |
| Memory                     | x                                   |                                     |

### How is it run - SAM

_Configured with plain Lambda Invoke and SAM Template Invoke_

-   Build in container
-   Skip new image check
-   docker network
-   build args
-   local invoke args

### How is it run - AWS

_Configured with plain Lambda Invoke and SAM Template Invoke_

-   Credentials
-   Region

### Concept

```json
{
    "configurations": [
        {
            "name": "a",
            "type": "aws-sam",
            "request": "template-invoke",
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
            "event": {
                "path": "somepath",
                "json": {
                    // some json
                    // path or json, not both
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
        },
        {
            "name": "a2",
            "type": "aws-sam",
            "request": "template-api",
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
            // If event is missing, don't terminate
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
        // lambda invoke -- programmatically generate the template equivalents
        // {
        //     "name": "a3",
        //     "type": "aws-sam",
        //     "request": "lambda-invoke"
        // },
        // {
        //     "name": "a4",
        //     "type": "aws-sam",
        //     "request": "lambda-api"
        // }
    ]
}
```

---

### template invoke

#### from UI

? No UI ?

-   pick template + resource
-   other configuration
-   select event
-   Buttons: Run, Debug, Save to Debug Config

### template start-api

-   sam build
-   sam local start-api
-   make http request
-   surface results (statusCode, sam output, response)
-   terminate process

*   What about keeping it running?

#### from UI

-   pick template + resource
-   ? No other configuration ?
-   set path
-   set method
-   set query, body
-   Buttons: Start, Request, End, Debug Toggle

### Defining Debug Configurations

Multiple options are available for users to create and define Debug Configurations.

TODO : SEE : https://code.visualstudio.com/docs/editor/debugging#_add-a-new-configuration

#### Manual launch.json editing

Users open their `launch.json` file and add a Debug Configuration of type `AWS-SAM-Local`. Intellisense provides assistance around available fields, field descriptions, and missing field validation. User documentation is necessary, however the schema is simple.

Once entered, they can select their configuration from the Debug Panel dropdown, and initiate a debug session by pressing F5.

#### Template

VS Code provides "Add Configuration..." functionality, providing users with a list of Debug Configuration templates. An entry for "Local Serverless Application Debugging" produces a `AWS-SAM-Local` configuration with the minimum required fields for users to fill in. The templating system does not allow for further interactions with the user before producing a configuration, however the field descriptions and validation will assist users in filling in the configuration.

### Toolkit Command

A Toolkit Command provides a more interactive means of producing the configuration. Users are presented with a list of all SAM Templates detected in their Workspace. After selecting a template, users are shown a list of the template's resources that are lambda handlers. Debug Configuration entries will be auto-generated for selected resources, and written into `launch.json`.

This Command is accessed from the Command Palette. TODO : TBD : Are there any other menus it makes sense to add it to?

#### Automatic creation of Debug Configurations

VS Code provides extensions with the ability to automatically produce Debug Configuration entries. The automatically generated configuration entries are written to the workspace's `launch.json` file. TODO : Link API ProvideX call. The toolkit's Local Debug Configuration provider scans a workspace for all SAM Template files, and produces a Debug Configuration for every template resource that is a lambda handler.

VS Code only uses this functionality when a workspace does not contain a `launch.json` file. The other approaches to creating configurations help with this shortcoming by providing users with ways to create new Debug Configuration entries after their project (and workspace) have been initially set up. Additionally, users can delete their `launch.json` file, and have VS Code regenerate Debug Configuration entries into the file.

## Local SAM Templates View

A panel showing all of the SAM Templates that exist in a workspace provides a way of grouping all SAM related operations together.

The view is a tree where each root-level node represents a SAM Template file in the workspace. Each SAM Template node's children represent that template's resources that are lambda handlers. The Toolkit watches for SAM Template files in the workspace. As SAM Template files are found/created/deleted/modified, the View is updated to reflect the templates and resources available to work with.

This View resides next to the AWS Explorer View in the Side Bar for the AWS Panel. Users that aren't interested in SAM Template operatons can elect to hide the View. More information about managing Views in VS Code can be found [here](https://code.visualstudio.com/docs/getstarted/userinterface#_views).

### Template Node Operations

-   Jump to File (double click, context menu) - Opens the SAM Template file in VS Code
-   Generate Debug Configurations (context menu) - generates Debug Configuration entries for each of the child node resources
-   Deploy (context menu) - deploys SAM Application to AWS

### Template Resource Node Operations

-   Jump to Resource (context menu) - Opens the SAM Template and places the cursor at the corresponding resource
-   Jump to Code (double click, context menu) - Determines the function associated with the template resource and opens the file in VS Code (this might be tricky to do)
-   Generate Debug Configuration (context menu) - generates Debug Configuration entries for each of the child node resources and saves them in `launch.json`
-   Run Locally (context menu) - Invokes this template resource locally without attaching a debugger
    -   TODO : TBD : Run Local without Debug Config / Debugger?
-   Debug Locally (context menu) - Invokes this template resource locally and attaches a debugger
    -   this generates the same debug configuration as "Generate Debug Configuration", and tells VS Code to start it instead of saving it to the launch.json file
-   TODO : TBD : Configure?

### View Operations (not node specific)

-   Create New SAM App - Launches the workflow to create a new SAM Application

## CodeLenses on Lambda Handlers

A set of CodeLenses appear above function signatures that are recognized as Lambda handlers. The CodeLenses are detailed below. These CodeLenses allow users to locally invoke the current function code as a Lambda handler.

This debugging experience differs from the other ones in that the Lambda handler is run independently of any SAM Templates. All other debugging experiences invoke a resource that is already defined in a SAM Template. When these CodeLenses are used, a temporary SAM Template is produced that only contains the function of interest. When the debugging session is completed, the temporary SAM Template is deleted.

### Run Locally

The function associated with this CodeLens is placed into a new (temporary) SAM Application and then invoked without attaching a debugger.

### Debug Locally

The function associated with this CodeLens is placed into a new (temporary) SAM Application, and then invoked. A debugger is then attached to the invoked program.

### Configure

Allows users to configure the environment that the associated function can be locally run or debugged in.

Examples of what can be configured include:

-   Environment variables
-   Event payload (the object passed into the Lambda function when it is invoked)
-   Runtime
-   Root folder - This is the folder that is used as the root folder when the function is invoked. By default, it uses the folder containing the code file
-   Path to Manifest file relative to the root folder
    -   For a Javascript program, the `package.json` file
    -   For a Python program, the `requirements.txt` file

## Appendix

### Differences between this doc and v1.0.0 of Toolkit

-   Lambda Handlers no longer associated with SAM Templates

### Sample Debug Configurations

---

Additional Ideas

-   CodeLenses on SAM Templates - Template-level operations (create Debug Configurations for a Resource?)

TODO : Appendix: Section comparing proposal to existing feature

# SCRAP

## Old Overview

The Local Debugging features released in version 1.0 are limited, and have some design limitations. TODO Reference Issue. This proposal improves the user experience with additional ways to locally debug SAM Applications, and disambiguates some of the unspecified behaviors.
