# Debugging Python lambda functions

## Install and configure prerequisites

1. Install [Docker](https://www.docker.com/get-started) and start the Docker service.
2. Install [AWS SAM CLI](https://github.com/awslabs/aws-sam-cli/releases).
3. Install [Python](https://www.python.org/downloads/). AWS Lambda supports Python 2.7, 3.6, and 3.7.
4. Install [Visual Studio Code](https://code.visualstudio.com/download).
5. Install the AWS Toolkit for Visual Studio Code. <!-- TODO: Add marketplace link once the toolkit is published. -->
6. Install the [Python extension for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=ms-python.python).
7. Launch Visual Studio Code and open a SAM application or create a new one. <!-- TODO: Link to separate doc with instructions. -->
8. Open a terminal at the root of your application and configure `virtualenv`:

```bash
# Bash
python -m venv ./.venv
. ./.venv/Scripts/activate
python -m pip install -r requirements.txt
```

```powershell
# PowerShell
python -m venv .\.venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Instrument your code

1. Add the line `ptvsd==4.2.4` to `<app root>/requirements.txt`
2. Open a terminal in `<app root>`, then run `python -m pip install -r requirements.txt`
3. Select a port to use for debugging. In this example, we will use port `5678`.
4. Add the following code to the beginning of your lambda handler in `app.py`:

    ```python
    print("waiting for debugger to attach...")
    ptvsd.enable_attach(address=('0.0.0.0', 5678), redirect_output=True)
    ptvsd.wait_for_attach()
    ```

## Configure your debugger

1. Open `<app root>/.vscode/launch.json` (create a new file if it does not already exist), and add the following contents:

    ```json
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
                        "localRoot": "${workspaceFolder}/hello_world",
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

## Start debugging

1. Set a breakpoint in your lambda handler somewhere after the line `ptvsd.wait_for_attach()`.
2. Open a terminal in `<app root>`, and run the following commands:

    ```bash
    # Bash
    . ./.venv/Scripts/activate
    echo '{}' | sam local invoke HelloWorldFunction -d 5678
    ```

    ```powershell
    # PowerShell
    .\.venv\Scripts\Activate.ps1
    echo '{}' | sam local invoke HelloWorldFunction -d 5678
    ```

3. When you see `waiting for debugger to attach...`, go back to Visual Studio Code and press F5.
