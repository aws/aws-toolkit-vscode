# Debugging Python Lambda Functions

You can debug your Serverless Application's AWS Lambda function locally using the CodeLens links above the lambda handler. If you would like to use the Debug Panel to launch the debugger instead, use the following steps to configure your project's Debug Configuration.

## Install and Configure Prerequisites

1. Install the [AWS Toolkit for Visual Studio Code (VS Code)](https://marketplace.visualstudio.com/items?itemName=AmazonWebServices.aws-toolkit-vscode) (also see the [user guide](https://docs.aws.amazon.com/console/toolkit-for-vscode/setup-toolkit)).
1. Install the [Python extension for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=ms-python.python). This extension gives VS Code the ability to debug Python applications.
1. Re-launch VS Code if necessary and open a SAM application or [create a new one](https://docs.aws.amazon.com/console/toolkit-for-vscode/create-sam).
1. Open the folder that contains `template.yaml`.
1. Open a terminal at the root of your application and configure `virtualenv` by running `python -m venv ./.venv`.

## Instrument Your Code

Throughout these instructions, replace the following:

|Name|Replace With|
|-|-|
|`<sam app root>`|The root of your SAM app (typically this is the directory containing `template.yaml`)|
|`<python project root>`|The root of your Python source code (typically this is the directory containing `requirements.txt`)|

1. Add the line `ptvsd==4.2.4` to `<python project root>/requirements.txt`
2. Open a terminal in `<sam app root>`, then run:

    ```bash
    # Bash
    . ./.venv/bin/activate
    python -m pip install -r <python project root>/requirements.txt
    ```

    ```powershell
    # PowerShell
    .\.venv\Scripts\Activate.ps1
    python -m pip install -r <python project root>/requirements.txt
    ```

3. Select a port to use for debugging. In this example, we will use port `5678`.
4. Add the following code to the beginning of `<python project root>/app.py`:

    ```python
    import ptvsd
    import sys
    ptvsd.enable_attach(address=('0.0.0.0', 5678), redirect_output=True)
    print("waiting for debugger to attach...")
    sys.stdout.flush()
    ptvsd.wait_for_attach()
    ```

## Configure Your Debugger

1. Open `<sam app root>/.vscode/launch.json` (create a new file if it does not already exist), and add the following contents.

    * Due to a bug in how VS Code handles path mappings, Windows users must provide an absolute path for `localRoot`. If you use a path relative to `${workspaceFolder}`, the path mappings will not work.
    * If desired, replace `5678` with the port that you wish to use for debugging.

    ```jsonc
    {
        "version": "0.2.0",
        "configurations": [
            {
                "name": "Python: Remote Attach",
                "type": "python",
                "request": "attach",
                "port": 5678,
                "host": "localhost",
                "pathMappings": [
                    {
                        "localRoot": "${workspaceFolder}/<python project root>",
                        "remoteRoot": "/var/task"
                    }
                ]
            }
        ]
    }
    ```

2. Launch Visual Studio Code and open the folder containing your application.
3. Press `Ctrl+Shift+D` or click the `Debug` icon to open the debug viewlet:

    ![Debug Icon](./images/view_debug.png)

4. Select `Python: Remote Attach` from the drop-down menu at the top of the viewlet:

    ![Launch Configuration](./images/select_launch_config.png)

## Start Debugging

1. Set a breakpoint in your lambda handler somewhere after the line `ptvsd.wait_for_attach()`.
2. Open a terminal in `<sam app root>`, and run the following commands. The SAM CLI will invoke your lambda handler, and wait for a debugger to attach to it. Replace `HelloWorldFunction` with the name of the function that you want to invoke.

    ```bash
    # Bash
    . ./.venv/Scripts/activate
    sam build --use-container
    echo '{}' | sam local invoke HelloWorldFunction -d 5678
    ```

    ```powershell
    # PowerShell
    .\.venv\Scripts\Activate.ps1
    sam build --use-container
    echo '{}' | sam local invoke HelloWorldFunction -d 5678
    ```

3. When you see `waiting for debugger to attach...`, go back to Visual Studio Code and press F5 to attach the debugger to the handler that you invoked in the previous step.

## Optional: Automatically Start Debugging When Ready

With the above steps, you need to manually invoke SAM CLI from the command line, wait for it to be ready, then attach the debugger. We can automate the process of invoking SAM CLI and waiting for it to be ready by using a `preLaunchTask`.

1. Open `<sam app root>/.vscode/tasks.json` (create a new file if it does not already exist).
2. Add the following contents to `tasks.json`:

    ```jsonc
    {
        // See https://go.microsoft.com/fwlink/?LinkId=733558
        // for the documentation about the tasks.json format
        "version": "2.0.0",
        "tasks": [
            {
                "label": "Debug Python Lambda Function",
                "type": "shell",
                "command": "sam",
                "args": [
                    "local",
                    "invoke",
                    "HelloWorldFunction", // Replace this with the resource name of your lambda function from your Serverless Application template.yaml file
                    "--template",
                    "${workspaceFolder}/.aws-sam/build/template.yaml", // Replace this with the appropriate workspace-relative path to your Serverless Application template.yaml file
                    "--no-event",
                    "-d",
                    "5678"
                ],
                "options": {
                    "env": {
                        "VIRTUAL_ENV": "${workspaceFolder}/.venv"
                    }
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
                        "endsPattern": "^waiting for debugger to attach\\.\\.\\.$"
                    }
                }
            }
        ]
    }
    ```

3. Open `<sam app root>/.vscode/launch.json`, and add the following property to the `Python: Remote Attach` configuration that you created earlier, after `"request": "attach",`:

    ```jsonc
    "preLaunchTask": "Debug Python Lambda Function",
    ```

Now you can just press `F5`, and Visual Studio Code will invoke SAM CLI and wait for the `waiting for debugger to attach...` message before attaching the debugger.
