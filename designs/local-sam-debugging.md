# Design Proposal: Local Debugging Experience for SAM Applications

Current Proposal Stage: General Experience

Future Proposal Stages (as future PRs):

-   General Experience In-depth
-   Architecture

Previous Proposal Stages:

-   None

## Overview

The Local Debugging features released in version 1.0 are limited, and have some design limitations. TODO Reference Issue. This proposal improves the user experience with additional ways to locally debug SAM Applications, and disambiguates some of the unspecified behaviors.

Users can Locally Debug SAM Applications in the following ways:

-   Debug Configurations - Launch a Debugging session using the Debug Panel in VS Code and pressing F5.
-   Local SAM Templates View - One UI Location to see and act on all SAM Applications / Functions
-   CodeLenses on Lambda Handlers - Locally run and debug a Lambda handler function without any SAM Template associations

## Debug Configurations

Debug Configurations are entries in a `launch.json` file that VS Code and Extensions use to define Debug sessions. TODO provide link to VS Code Debugging. By supporting Debug Configuration, users can press F5 (or the Debug button) to start a Debugging session.

A Debug Configuration type `AWS-SAM-Local` references a SAM Template, and a Resource name from that template. To handle these configurations, the Toolkit looks up the reeferenced template resource and starts a debug session. The resource's runtime affects pre-debug steps (such as installing the dotnetcode debugger), and which language debugger is used.

The Debug Configuration is only way to invoke the debugger. All of the design options build on this facility.

TODO : Unknown : Can we invoke local Run by other means?

### Sample

TODO : Sample SAM Template
TODO : Sample Debug Configuration

Validations:

-   SAM Template exists
-   Resource exists in template
-   Runtime is supported by Toolkit

TBD Future Proposal Stage:

-   configuring overrides for the template/resource

### Defining Debug Configurations

Multiple options are available for users to create and define Debug Configurations.

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

Debug Configurations and the SAM Templates View operate against resources in the SAM Template. Users might want to prototype or iterate on a specific Lambda function before incorporating it into a SAM Template. CodeLenses provide way to run or debug a function without requiring any SAM Template definitions.

---

Additional Ideas

-   CodeLenses on SAM Templates - Template-level operations (create Debug Configurations for a Resource?)

TODO : Section comparing proposal to existing feature
