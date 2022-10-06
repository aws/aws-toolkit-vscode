## Development

These notes are to help you setup and contribute to the Mynah VS Code extension

### Usage

#### 1. Create a workspace if you haven't already

```
brazil ws create --name mynah-vscode --root ./mynah-vscode --versionSet mynah/live
```

#### 2. Checkout the package into your workspace

```
brazil ws use -p MynahHelpMeFixVsCodePlugin
```

#### 3. Build

Build the extension. This will generate `mynah.vsix` in `build/extension/`. You can install this VSIX in your local VS Code installation.

```
brazil-build clean && brazil-build release
```

#### 4. Test

The tests still need to be run manually because internet access is needed to download the executable (i.e tests cannot be run on the sandbox build fleet yet). You also need to make sure that you don't have VS Code running when invoking the test script. To run the tests:

```
brazil-build test
```

### Known issues/improvements

Please feel free to add to this list or strikethrough if you have addressed any of these issues.

-   Check in a version of the VS Code executable and use it to run the tests instead of relying on internet access (please account for multiple platforms)
-   Consider using VS Code insiders for development and stable for running tests. This will obviate the need to shutdown VS Code before running tests.
-   Write a suite of integration tests that actually perform search.
-   Enable linting using `eslint`.
-   Refactor the source in `src/media` to TypeScript and compile with the correct environment.
-   Refactor command registration to be done by a single object. This will force us to refactor how the dependency tree is constructed.
-   Ensure that all objects holding on to resources properly implement Disposable. Also subscribe these objects to be disposed when the extension is disabled.
