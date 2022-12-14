# VSCode Settings Configuration

## Overview

There are four main files when dealing with VSCode settings: `settings.json`, `extensions.json`, `tasks.json`, and `launch.json`.

### File overview

[settings.json](https://code.visualstudio.com/docs/getstarted/settings#_workspace-settings) is responsible for handling any settings you want to be in VSCode when they start the editor for the first time. This can range from default forwarded ports to pointing to where executables exist on the filesystem.

[extensions.json](https://code.visualstudio.com/docs/editor/extension-marketplace#_workspace-recommended-extensions) is responsible for handling which extensions should be installed in the workspace (or ignored). When VSCode is first started, the user will get prompted to install any extensions that are recommended in this file.

[tasks.json](https://code.visualstudio.com/docs/editor/tasks) is responsible for handling background tasks that are specific to the project. These can be common tasks like `npm run compile` or `mvn test`.

[launch.json](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations) is responsible for handling the visual running and debugging of applications. This would be something like running `mvn test` and then attaching a debugger instance to it.

### Folder structure

VSCode requires the following project structure when adding in VSCode settings:

```
project_root/
    .vscode/
        settings.json
        extensions.json
        tasks.json
        launch.json
```

If your project has multiple roots:

```
my_frontend_application/
    main.js
my_backend_application/
    main.py
```

then the .vscode folder is expected to be at the root:

```
.vscode/
    settings.json
    extensions.json
    launch.json
    tasks.json
my_frontend_application/
    main.js
my_backend_application/
    main.py
```

## Settings.json

The `settings.json` file is for handling any settings you want to be in VSCode when they start the editor for the first time. On VSCode start, this file will provide default settings that might be necessary when starting/running your project.

For example, the following settings.json is used to expose local ports of a Vue application and setup the default python interpreter path:

```json
{
    "remote.portsAttributes": {
        "5173": {
            "label": "Vue Application"
        }
    },
    "remote.SSH.defaultForwardedPorts": [
        {
            "localPort": 5173,
            "name": "Vue Application Port",
            "remotePort": 5173
        }
    ],
    "python.defaultInterpreterPath": "python"
}
```

This is going to be project specific, but any configuration for VSCode settings should live here.

You can learn more about VSCode settings and the settings editor [here](https://code.visualstudio.com/docs/getstarted/settings#_settings-editor).

## Extensions.json

The `extensions.json` file is used to specify the recommended extensions that should be installed in the given workspace. When a user opens a new workspace, if any of the recommended extensions are not currently installed, the user will be prompted to install them.

In all extensions.json, we want to at minimum recommend the aws-toolkit-vscode extension.

```json
{
    "recommendations": ["amazonwebservices.aws-toolkit-vscode"]
}
```

Additional extensions should also be added depending on the front-end/back-end of the application.

## Tasks.json

The `tasks.json` is responsible for handling background tasks that run from the command line. These can be things common tasks like `npm run compile` or `mvn test`.

**Example:** [`npm run lint`](../.vscode/tasks.json#L40)

### Additional tips

-   Occasionally tasks can be long running and VSCode will throw an error if the task doesn’t seem to be making any progress. VSCode has a built-in way to handle this through isBackground and problemMatcher. This allows VSCode to wait for a pattern to appear in the terminal and stops VSCode from throwing an error if a task is running for too long. You can see this in the [`serve` task](../.vscode/tasks.json#L19)

## Launch.json

The `launch.json` is responsible for handling the visual running and debugging of applications. This would be like running a `mvn test` command and then attaching a debugger instance to it or compiling a VSCode extension and launching it in debug mode.

In order for us to debug and launch the application, we first need to create a pre-launch task which is responsible for building the application. Pre-launch tasks are just regular tasks defined in `.vscode/tasks.json.` See [this](https://code.visualstudio.com/docs/editor/tasks) and [this](#additional-tips) for more details on tasks.

**Example:** pre launch task [`npm: compile`](../.vscode/tasks.json#L50) that builds the project

Once you have a pre-launch task, you can delegate the responsibility of building the application to the task, and then the launch configuration will take care of attaching the debugger to the already running application instance.

**Example:** [Extension launch configuration](../.vscode/launch.json#L9) that waits for the your application to finish compiling and then attaches the debugger to the extension host.
