# Browser

This extension can run in the web browser (eg: [vscode.dev](https://vscode.dev)), but with limited functionality.

## Running the Browser implementation

You can run the browser implementation of the extension in the following ways.

### Running in VSCode

The following steps will result in a VSCode Extension window running
with the AWS Toolkit extension installed.
The difference from the regular
process is that in the background it is running as a browser environment
so certain things like Node.js modules will not be available.

1. In the terminal run: `npm run buildBrowser`

## Running in a Browser window

The following steps will result in a Chrome window running with VS Code
and the Browser version of the AWS Toolkit extension installed.

1. In the terminal run: `npm run runInBrowser`

##### (OPTIONAL) Disabling CORS

In the case you want to disable CORS in the browser for something like
contacting the telemetry api endpoint, do the following.

The script that starts the browser does not provide a way to disable security,
so we need to modify the code slightly to ensure the browser starts with CORS disabled.

1. Go to `./node_modules/@vscode/test-web/out/index.js`
2. Go to the function `openBrowser()`
3. Add the line `args.push('--disable-web-security')`

Now when you run the extension in the browser it will not do CORS checks.

#### Debugging in Browser window

Debugging in the Browser is more difficult than the Node.js/Desktop
version.

-   Breakpoints do not work, we cannot step through the code.

The best we can do (as far as I know) is to read logs.

To get to the VS Code logs go to:

1. The `Output` tab
2. In the top right drop-down select: `Extension Host (Worker)`

> The VS Code logs will show errors if we try to use modules that do not exist in the Browser.

To get to the AWS Toolkit logs:

1. Open Command Palette: `cmd/ctrl` + `shift` + `p`
2. Type: `AWS: View Toolkit Logs`
