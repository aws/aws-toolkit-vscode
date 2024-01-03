# AWS Toolkit codebase

Notes about the codebase, its utilities, special globals, etc.

## VSCode context keys

VScode extensions can use vscode 'setContext' command to set special context keys which are
available in `package.json`.

### Defining a new setContext key

If you must define a new key,

-   Prefix it with `aws.` as recommended by the [vscode docs](https://code.visualstudio.com/api/extension-guides/command#using-a-custom-when-clause-context).
-   Use brevity. Less is more.
-   Document it in the list below.

### Toolkit setContext keys

We set the following keys:

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
