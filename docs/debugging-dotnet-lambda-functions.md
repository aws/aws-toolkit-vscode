# Debugging .NET Core lambda functions

These instructions outline how you can debug a lambda handler locally using the SAM CLI, and attach the VS Code debugger to it.

## Install and configure prerequisites

1. Install the [AWS Toolkit for Visual Studio Code](https://github.com/aws/aws-toolkit-vscode#getting-started).
2. Install the [C# extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.csharp). This extension gives VS Code the ability to debug .NET Core applications.
3. Launch Visual Studio Code and open a SAM application or create a new one. <!-- TODO: Link to separate doc with instructions. -->

    Note: Open the folder that contains `template.yaml`.

4. Open a terminal in the folder containing `template.yaml` and set up the debugger by running the following commands:

    * Replace `path/to/project` with the relative path to the directory containing the `.csproj` project that you want to debug.
    * Replace `/absolute/path/to/project` with the absolute path to the directory containing the `csproj` project that you want to debug.
    * Replace `dotnetcore2.0` with the framework identifier for the runtime that you are targetting.

    ```bash
    mkdir path/to/project/.vsdbg
    docker run --rm --mount type=bind,src=/absolute/path/to/project/.vsdbg,dst=/vsdbg --entrypoint bash lambci/lambda:dotnetcore2.0 -c "curl -sSL https://aka.ms/getvsdbgsh | bash /dev/stdin -v latest -l /vsdbg"
    ```

## Configure your debugger

1. Open `<workspace folder root>/.vscode/launch.json` (create a new file if it does not already exist), and add the following contents:

    * Due to a bug in how Visual Studio Code handles path mappings, Windows users must replace `${workspaceFolder}` with the absolute path to the folder containing `template.yaml`.
    * If desired, replace `5679` with the port that you wish to use for debugging.

    ```jsonc
    {
        "version": "0.2.0",
        "configurations": [
            {
                "name": ".NET Core Docker Attach",
                "type": "coreclr",
                "request": "attach",
                "processId": "1",
                "pipeTransport": {
                    "pipeProgram": "sh",
                    "pipeArgs": [
                        "-c",
                        "docker exec -i $(docker ps -q -f publish=5679) ${debuggerCommand}"
                    ],
                    "debuggerPath": "/tmp/lambci_debug_files/vsdbg",
                    "pipeCwd": "${workspaceFolder}/path/to/project",
                },

                "windows": {
                    "pipeTransport": {
                        "pipeProgram": "powershell",
                        "pipeArgs": [
                            "-c",
                            "docker exec -i $(docker ps -q -f publish=5679) ${debuggerCommand}"
                        ],
                        "debuggerPath": "/tmp/lambci_debug_files/vsdbg",
                        "pipeCwd": "${workspaceFolder}/path/to/project",
                    }
                },

                "sourceFileMap": {
                    "/var/task": "${workspaceFolder}/path/to/project"
                }
            }
        ]
    }
    ```

2. Launch Visual Studio Code and open the folder containing your application.
3. Press `Ctrl+Shift+D` or click the `Debug` icon to open the debug viewlet:

    ![Debug Icon](./images/view_debug.png)

4. Select `.NET Core: Remote Attach` from the drop-down menu at the top of the viewlet.

## Start debugging

1. Set a breakpoint anywhere in your lambda handler.
2. Open a terminal in the folder containing `template.yaml`, and run the following commands. The SAM CLI will invoke your lambda handler, and wait for a debugger to attach to it.

    * Replace `HelloWorldFunction` with the name of the function that you want to invoke.
    * Replace `5679` with the port that you specified in `launch.json`.

    ```bash
    sam build # TODO: First set the environment variable that enables building the Debug configuration.
    sam local invoke HelloWorldFunction -d 5679 --debugger-path path/to/project/.vsdbg --no-event
    ```

3. When you see `Waiting for debugger to attach...`, go back to Visual Studio Code and press F5 to attach the debugger to the handler that you invoked in the previous step.

## Optional: Automatically start debugging when ready

With the above steps, you need to manually invoke SAM CLI from the command line, wait for it to be ready, then attach the debugger. We can automate the process of invoking SAM CLI and waiting for it to be ready by using a `preLaunchTask`.

1. Open `<sam app root>/.vscode/tasks.json` (create a new file if it does not already exist).
2. Add the following contents to `tasks.json`:

    * Replace `HelloWorldFunction` with the function that you wish to debug.
    * Replace `path/to/project` with the relative path to the directory containing the `.csproj` project that you wish to debug.

    ```jsonc
    {
        "version": "2.0.0",
        "tasks": [
            {
                "label": "Debug .NET Core Lambda Function",
                "type": "shell",
                "command": "sam",
                "args": [
                    "local",
                    "invoke",
                    "HelloWorldFunction",
                    "-d",
                    "5679",
                    "--debugger-path",
                    "path/to/project/.vsdbg",
                    "--no-event"
                ],
                "isBackground": true,
                "problemMatcher": {
                    "pattern": [
                        {
                            // Use regex that never matches anything.
                            "regexp": "^(x)(\\b)(x)$",
                            "file": 1,
                            "location": 2,
                            "message": 3
                        }
                    ],
                    "background": {
                        // This is how the debugger knows when it can attach
                        "activeOnStart": true,
                        "beginsPattern": "^Fetching lambci\\.\\w+ Docker container image",
                        "endsPattern": "^Waiting for the debugger to attach\\.\\.\\.$"
                    }
                }
            }
        ]
    }
    ```

3. Open `<sam app root>/.vscode/launch.json`, and add the following property to the `.NET Core: Remote Attach` configuration that you created earlier, after `"request": "attach",`:

    ```jsonc
    "preLaunchTask": "Debug .NET Core Lambda Function",
    ```

Now you can just press `F5`, and Visual Studio Code will invoke SAM CLI and wait for the `Waiting for debugger to attach...` message before attaching the debugger.
