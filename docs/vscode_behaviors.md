# VS Code Behaviors

Many VS Code behavoirs for certain APIs or user interactions with the IDE are not clearly documented,
or documented at all. Please add any findings to this document.

## `deactivate()` - extension shutdown

This method is defined as part of the VS Code extension API, and is run on a **graceful** shutdown
for each extension.

-   Our extension and its `deactivate()` function are in the Extension Host process [1]
-   The Extension Host process has at most 5 seconds to shut down, after which it will exit. [1]
-   The vscode API will be unreliable at deactivation time. So certain VSC APIs like the filesystem may not work. [1]
    -   The VSC Filesystem API has been confirmed to not work
- In `Run & Debug` mode, closing the Debug IDE instance behaves differently depending on how it is closed
    - The regular close button in the Debug IDE instance results in a graceful shutdown
    - The red square in the root IDE instance to stop the debugging session results on a non-graceful shutdown, meaning `deactivate()` is not run.

Sources:

-   [[1]](https://github.com/Microsoft/vscode/issues/47881#issuecomment-381910587)
-   [[2]](https://github.com/microsoft/vscode/issues/122825#issuecomment-814218149)
