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
-   Local SAM Templates Panel - One UI Location to see and act on all SAM Applications / Functions
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

VS Code provides extensions with the ability to automatically produce Debug Configuration entries, and write them to `launch.json`. TODO : Link API ProvideX call. VS Code only uses this feature when a workspace does not contain a `launch.json` file. The other options discussed help address this limitation by providing additional ways to produce a configuration well after a `launch.json` file has been established.

TODO : write up what we'd do here

Additional Ideas

-   CodeLenses on SAM Templates - Template-level operations (create Debug Configurations for a Resource?)

TODO : Section comparing proposal to existing feature
