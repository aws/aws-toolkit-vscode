# Debugging .NET Core Lambda Functions

You can debug your Serverless Application's AWS Lambda function locally using the CodeLens links above the lambda handler. If you would like to use the Debug Panel to launch the debugger instead, use the following steps to configure your project's Debug Configuration.

## Install and Configure Prerequisites

1. Install the [AWS Toolkit for Visual Studio Code (VS Code)](https://marketplace.visualstudio.com/items?itemName=AmazonWebServices.aws-toolkit-vscode) (also see the [user guide](https://docs.aws.amazon.com/console/toolkit-for-vscode/setup-toolkit)).
1. Install the [C# extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.csharp). This extension gives VS Code the ability to debug .NET Core applications.
1. Re-launch VS Code if necessary and open a SAM application or [create a new one](https://docs.aws.amazon.com/console/toolkit-for-vscode/create-sam).
1. Open the folder that contains `template.yaml`.
1. Open a terminal in the folder containing `template.yaml` and set up the debugger by running the following commands:

    * Replace `<CODE_URI>` (in two places) with the *absolute path that corresponds to* the `CodeUri` property (not the `CodeUri` property itself) from `template.yaml` for the resource that you wish to debug.
    * If appropriate, replace `dotnetcore2.1` with the framework identifier for the runtime that you are targeting.

    ```bash
    mkdir <CODE_URI>/.vsdbg
    docker run --rm --mount type=bind,src=<CODE_URI>/.vsdbg,dst=/vsdbg --entrypoint bash lambci/lambda:dotnetcore2.1 -c "curl -sSL https://aka.ms/getvsdbgsh | bash /dev/stdin -v latest -l /vsdbg"
    ```

## Configure Your Debugger

1. Open `<workspace folder root>/.vscode/launch.json` (create a new file if it does not already exist), and add the following contents:

    * If desired, replace `5679` with the port that you wish to use for debugging.

    ```jsonc
    {
        "version": "0.2.0",
        "configurations": [
            {
                "name": "SamLocalDebug",
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
                    "pipeCwd": "<CODE_URI>"
                },
                "windows": {
                    "pipeTransport": {
                        "pipeProgram": "powershell",
                        "pipeArgs": [
                            "-c",
                            "docker exec -i $(docker ps -q -f publish=5679) ${debuggerCommand}"
                        ],
                        "debuggerPath": "/tmp/lambci_debug_files/vsdbg",
                        "pipeCwd": "<CODE_URI>"
                    }
                },
                "sourceFileMap": {
                    "/var/task": "<CODE_URI>"
                }
            }
        ]
    }
    ```

2. Launch Visual Studio Code and open the folder containing your application.
3. Press `Ctrl+Shift+D` or click the `Debug` icon to open the debug viewlet:

    ![Debug Icon](./images/view_debug.png)

4. Select `SamLocalDebug` from the drop-down menu at the top of the viewlet. Do not start debugging yet, just select the configuration from the list. Follow the steps below to build and launch your application before launching the debugger.

## Start Debugging

1. Set a breakpoint anywhere in your lambda handler.
2. Open a terminal in the folder containing `template.yaml`, and run the following commands. The SAM CLI will invoke your lambda handler, and wait for a debugger to attach to it.

    * Replace `HelloWorldFunction` with the name of the function that you want to invoke.
    * Replace `5679` with the port that you specified in `launch.json`.

    ```bash
    # Bash
    export SAM_BUILD_MODE=debug
    sam build
    sam local invoke HelloWorldFunction -d 5679 --debugger-path <CODE_URI>/.vsdbg --no-event
    ```

    ```powershell
    # Powershell
    $env:SAM_BUILD_MODE = 'debug'
    sam build
    sam local invoke HelloWorldFunction -d 5679 --debugger-path <CODE_URI>/.vsdbg --no-event
    ```

3. When you see `Waiting for debugger to attach...`, go back to Visual Studio Code and press F5 to attach the debugger to the handler that you invoked in the previous step.

## Optional: Automatically Start Debugging When Ready

With the above steps, you need to manually invoke SAM CLI from the command line, wait for it to be ready, then attach the debugger. We can automate the process of invoking SAM CLI and waiting for it to be ready by using a `preLaunchTask`.

1. Open `<sam app root>/.vscode/tasks.json` (create a new file if it does not already exist).
2. Add the following contents to `tasks.json`:

    * Replace `HelloWorldFunction` with the function that you wish to debug.

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
                    "<CODE_URI>/.vsdbg",
                    "--no-event"
                ],
                "options": {
                    "cwd": "/absolute/path/to/folder/containing/template.yaml"
                },
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

Now you can just press `F5`, and Visual Studio Code will invoke SAM CLI and wait for the `Waiting for debugger to attach...` message before attaching the debugger. When you make changes to your app, you must rebuild using the `sam build` command with the environment variable `SAM_DEBUG_MODE` set to `"debug"` before you press `F5`.
