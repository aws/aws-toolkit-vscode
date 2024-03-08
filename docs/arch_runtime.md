# Architecture: runtime behavior and communication

> Describes the _runtime_ behavior and design of AWS Toolkit.
> Corresponds to the "Process view" of the [4+1 architectural views](https://en.wikipedia.org/wiki/4%2B1_architectural_view_model).

## Environment variables

TODO: move from CONTRIBUTING.md

## VSCode context keys

VScode extensions can use vscode 'setContext' command to set special context keys which are
available in `package.json`.

### Defining a new setContext key

If you must define a new key (is it _really_ necessary?), follow these guidelines:

-   Choose a prefix as follows (as [recommended](https://code.visualstudio.com/api/extension-guides/command#using-a-custom-when-clause-context)):
    -   `packages/core/` should use `aws.` prefix
    -   `packages/toolkit/` should use `aws.toolkit.` prefix
    -   `packages/amazonq/` should use `amazonq.` prefix
-   Use brevity. Less is more.
-   Document it in the list below.

### setContext keys

#### setContext keys owned by packages/core/

These keys are currently set by the core/ package, but many of them may eventually be migrated to
toolkit/ or amazonq/ if appropriate.

-   `isCloud9`: This is hardcoded by Cloud9 itself, not the Toolkit.
    -   Cloud9 _does not support setContext_. So this is the only usable key there.
-   `aws.codecatalyst.connected`: CodeCatalyst connection is active.
-   `aws.codewhisperer.connected`: CodeWhisperer connection is active.
-   `aws.codewhisperer.connectionExpired`: CodeWhisperer connection is active, but the connection is expired.
-   `aws.isDevMode`: AWS Toolkit is running in "developer mode".
-   `aws.isWebExtHost`: true when the _extension host_ is running in a web browser, as opposed to
    nodejs (i.e. the environment has no "compute").
    -   Compare to `isWeb`, which vscode defines when the _UI_ is web, but says nothing about the
        _extension host_.
-   `aws.isSageMaker`: AWS Toolkit is running in the SageMaker Code Editor.

#### setContext keys owned by packages/toolkit/

-   TODO

#### setContext keys owned by packages/amazonq/

-   TODO

## How our components communicate

TODO: vscode events; the "globals" module; activate(); EventEmitters; ...?
