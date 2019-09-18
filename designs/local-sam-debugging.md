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

Debug Configurations are entries in a `launch.json` file that VS Code and Extensions use to define Debug sessions. TODO provide link to VS Code Debugging. Debug Configuration support allows users to press F5 (or the Debug button) to start a Debugging session.

A Debug Configuration type `AWS-SAM-Local` references a SAM Template, and a Resource name from that template. The Toolkit handles this configuration type by looking up the template resource, and starting a debug session based on the resource's runtime.

Validations:

-   SAM Template exists
-   Resource exists in template
-   Runtime is supported by Toolkit

TBD Research:

-   If we call startDebugging on a custom type, will it pass through the resolve debug configuration?

TBD Future Proposal Stage:

-   configuring overrides for the template/resource

### Defining Debug Configurations

Debug Configurations can be defined in the following ways.

#### Manual launch.json editing

#### Template

#### Automatic creation of Debug Configurations

Additional Ideas

-   CodeLenses on SAM Templates - Template-level operations (create Debug Configurations for a Resource?)

TODO : Section comparing proposal to existing feature
