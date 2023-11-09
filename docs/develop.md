# AWS Toolkit codebase

Notes about the codebase, its utilities, special globals, etc.

## VSCode context keys

VScode extensions can use vscode 'setContext' command to set special context keys which are
available in `package.json`. This extension sets the following keys:

-   `aws.codecatalyst.connected`: CodeCatalyst connection is active.
-   `CODEWHISPERER_ENABLED`: CodeWhisperer connection is active.
-   `aws.isDevMode`: AWS Toolkit is running in "developer mode".
-   `aws.isWebExtHost`: true when the _extension host_ is running in a web browser, as opposed to
    nodejs (i.e. the environment has no "compute").
    -   Compare to `isWeb`, which vscode defines when the _UI_ is web, but says nothing about the
        _extension host_.
