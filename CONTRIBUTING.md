# Contributing Guidelines

Thank you for your interest in contributing to our project. We greatly value
feedback and contributions from our community!

Reviewing this document will maximize your success in working with the
codebase and sending pull requests.

## Getting Started

### Find things to do

If you're looking for ideas about where to contribute, consider
[_good first issue_](https://github.com/aws/aws-toolkit-vscode/labels/good%20first%20issue)
issues.

### Setup

To develop this project, install these dependencies:

-   [Visual Studio Code](https://code.visualstudio.com/Download)
-   [NodeJS and NPM](https://nodejs.org/)
    -   NodeJS Version: 12.x
    -   NPM version: 7.x or higher
-   [Typescript](https://www.typescriptlang.org/)
-   [Git](https://git-scm.com/downloads)
-   [AWS `git secrets`](https://github.com/awslabs/git-secrets)
-   (optional) [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
-   (optional) [Docker](https://docs.docker.com/get-docker/)

Then clone the repository and install NPM packages:

    cd ~/repos
    git clone git@github.com:aws/aws-toolkit-vscode.git
    cd aws-toolkit-vscode
    npm install

### Run

You can run the extension from Visual Studio Code:

1. Select the Run panel from the sidebar.
2. From the dropdown at the top of the Run pane, choose `Extension`.
3. Press `F5` to launch a new instance of Visual Studio Code with the extension installed and the debugger attached.

### Build

When you launch the extension or run tests from Visual Studio Code, it will automatically build the extension and watch for changes.

You can also use these NPM tasks (see `npm run` for the full list):

-   To build once:
    ```
    npm run compile
    ```
-   To build and watch for file changes:
    ```
    npm run watch
    ```
-   To build a release artifact (VSIX):
    ```
    npm run package
    ```
    - This uses webpack which may exhaust the default Node heap size on Linux.
      To fix this set `--max-old-space-size`:

      ```
      export NODE_OPTIONS=--max-old-space-size=8192
      ```
-   To build a "debug" VSIX artifact (faster and does not minify):
    ```
    npm run package -- --debug
    ```

## Develop

### Code guidelines

See [CODE_GUIDELINES.md](./docs/CODE_GUIDELINES.md) for coding conventions.

### Technical notes

- VSCode extensions have a [100MB](https://github.com/Microsoft/vscode-vsce/issues/179) file size limit.
- `src/testFixtures/` is excluded in `.vscode/settings.json`, to prevent VSCode
  from treating its files as project files.
- VSCode extension examples: https://github.com/microsoft/vscode-extension-samples
- How to debug unresolved promise rejections:
    1. Declare a global unhandledRejection handler.
       ```
       process.on('unhandledRejection', (e) => {
           getLogger('channel').error(
               localize(
                   'AWS.channel.aws.toolkit.activation.error',
                   'Error Activating {0} Toolkit: {1}',
                   getIdeProperties().company,
                   (e as Error).message
               )
           )
           if (e !== undefined) {
               throw e
           }
       });
       ```
    2. Put a breakpoint on it.
    3. Run all tests.

### Test

See [TESTPLAN.md](./docs/TESTPLAN.md) to understand the project's test
structure, mechanics and philosophy.

You can run tests directly from Visual Studio Code:

1. Select `View > Debug`, or select the Debug pane from the sidebar.
2. From the dropdown at the top of the Debug pane, select the `Extension Tests` configuration.
3. Press `F5` to run tests with the debugger attached.

You can also run tests from the command line:

    npm run test
    npm run integrationTest

Tests will write logs to `./.test-reports/testLog.log`.

#### Run a specific test

To run a single test in VSCode, do any one of:

-   Run the _Extension Tests (current file)_ launch-config.
-   Use Mocha's [it.only()](https://mochajs.org/#exclusive-tests) or `describe.only()`.
-   Run in your terminal:
    -   Unix/macOS/POSIX shell:
        ```
        NO_COVERAGE=true TEST_FILE=src/test/foo.test npm run test
        ```
    -   Powershell:
        ```
        $Env:NO_COVERAGE = "true"; $Env:TEST_FILE = "src/test/foo.test"; npm run test
        ```
-   To run all tests in a particular subdirectory, you can edit
    `src/test/index.ts:rootTestsPath` to point to a subdirectory:
    ```
    rootTestsPath: __dirname + '/shared/sam/debugger/'
    ```

#### Coverage report

You can find the coverage report at `./coverage/index.html` after running the tests.

## Pull Requests

Before sending a pull request:

1. Check that you are working against the latest source on the `master` branch.
2. Check existing open, and recently merged, pull requests to make sure someone else hasn't addressed the problem already.
3. Open an issue to discuss any significant work.

To send a pull request:

1. Fork the repository.
2. Modify the source; focus on the specific change you are contributing. If you also reformat all the code, it will be hard for us to focus on your change.
3. Ensure local tests pass.
4. Commit to your fork using clear commit messages.
5. Once you are done with your change, run `npm run newChange`, follow the prompts, then commit the changelog item to your fork.
6. Send us a pull request, answering any default questions in the pull request interface.
7. Pay attention to any automated CI failures reported in the pull request, and stay involved in the conversation.

GitHub provides additional document on [forking a repository](https://help.github.com/articles/fork-a-repo/) and
[creating a pull request](https://help.github.com/articles/creating-a-pull-request/).

### Commit messages

Generally, your pull request description should be a copy-paste of your commit
message(s). If your PR description provides insight not found in a commit
message, ask why. Source control (Git) is our source-of-truth, not GitHub.

Quick summary of commit message guidelines:

- Subject: single line up to 50-72 characters
    - Imperative voice ("Fix bug", not "Fixed"/"Fixes"/"Fixing").
- Body: for non-trivial or uncommon changes, explain your motivation for the
  change and contrast your implementation with previous behavior.
    - Often you can save a _lot_ of words by using this simple template:
      ```
      Problem: …
      Solution: …
      ```

A [good commit message](https://git-scm.com/book/en/v2/Distributed-Git-Contributing-to-a-Project)
has a short subject line and unlimited detail in the body.
[Good explanations](https://nav.al/explanations) are acts of creativity. The
"tiny subject line" constraint reminds you to clarify the essence of the
commit, and makes the log easy for humans to scan. The commit log is an
artifact that will live longer than any code in the codebase.

Consider prefixing the subject with a topic: this again helps humans (and
scripts) scan and omit ranges of the history at a glance. For example if I'm
looking for a code change, I can eliminate all of the `doc:` and `test:`
commits when inspecting this commit log:

    doc: update README.md
    test: Deploy wizard
    SAM debug: fix bug in foo
    doc: explain SAM debug architecture
    Lambda: add button to thing

### CI artifact

Each commit and pull request is processed by an automated system which runs
all tests and provides the build result via the _Details_ link as shown below.

<img src="./docs/images/ci-artifact.png" alt="CI artifact" width="512"/>

## Tooling

Besides the typical develop/test/run cycle describe above, there are
some tools for special cases such as build tasks, generating telemetry,
generating SDKs, etc.

### AWS SDK generator

When the AWS SDK does not (yet) support a service but you have an API
model file (`*.api.json`), use `generateServiceClient.ts` to generate
a TypeScript `*.d.ts` file and pass that to the AWS JS SDK to create
requests just from the model/types.

1. Add an entry to the list in `generateServiceClient.ts`:
   ```diff
    diff --git a/build-scripts/generateServiceClient.ts b/build-scripts/generateServiceClient.ts
    index 8bb278972d29..6c6914ec8812 100644
    --- a/build-scripts/generateServiceClient.ts
    +++ b/build-scripts/generateServiceClient.ts
    @@ -199,6 +199,10 @@ ${fileContents}
     ;(async () => {
         const serviceClientDefinitions: ServiceClientDefinition[] = [
    +        {
    +            serviceJsonPath: 'src/shared/foo.api.json',
    +            serviceName: 'ClientFoo'
    +        },
             {
                 serviceJsonPath: 'src/shared/telemetry/service-2.json',
                 serviceName: 'ClientTelemetry',
   ```
2. Run the script:
   ```
   $ ./node_modules/.bin/ts-node ./build-scripts/generateServiceClient.ts
   ```
3. The script produces a `*.d.ts` file (used only for IDE
   code-completion, not required to actually make requests):
   ```
   src/shared/foo.d.ts
   ```
4. To make requests with the SDK, pass the `*.api.json` service model to
   `ext.sdkClientBuilder.createAndConfigureServiceClient` as a generic
   `Service` with `apiConfig=require('foo.api.json')`.
   ```
   // Import the `*.d.ts` file for code-completion convenience.
   import * as ClientFoo from '../shared/clientfoo'
   // The AWS JS SDK uses this to dynamically build service requests.
   import apiConfig = require('../shared/foo.api.json')

   ...

   const c = await ext.sdkClientBuilder.createAndConfigureServiceClient(
       opts => new Service(opts),
       {
           apiConfig: apiConfig,
           region: 'us-west-2',
           credentials: credentials,
           correctClockSkew: true,
           endpoint: 'foo-beta.aws.dev',
       }) as ClientFoo
   const req = c.getThing({ id: 'asdf' })
   req.send(function (err, data) { ... });
   ```

## Importing icons from other open source repos

If you are contribuing visual assets from other open source repos, the source repo must have a compatible license (such as MIT), and we need to document the source of the images. Follow these steps:

1.   Use a separate location in this repo for every repo where images are
     sourced from, in the form `third-party/resources/from-<BRIEF_REPO_NAME>`.
1.   Copy the source repo's licence into this destination location's LICENSE.txt file
1.   Create a README.md in the destination location, and type in a copyright attribution:
     ```text
     The AWS Toolkit for VS Code includes the following third-party software/licensing:

     Icons contained in this folder and subfolders are from <SOURCE_REPO_NAME>: <SOURCE_REPO_URL>

     <PASTE_SOURCE_LICENSE_HERE>
     ```
1.   Copy the SVG file(s) into a suitable place within the destination location, for example `.../dark/xyz.svg` and `.../light/xyz.svg`
1.   Add an entry to `third-party/README.md` summarizing the new destination location, where the asserts were sourced from, and a brief rationale.

[PR #227](https://github.com/aws/aws-toolkit-vscode/pull/227) shows an example.

## Code of Conduct

This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments.

## Security issues

If you discover a potential security issue in this project we ask that you
notify AWS/Amazon Security via the [vulnerability reporting
page](http://aws.amazon.com/security/vulnerability-reporting/). Please do
**not** create a public issue.

## Licensing

See the [LICENSE](https://github.com/aws/aws-vscode-toolkit/blob/master/LICENSE) file for our project's licensing. We will ask you to confirm the licensing of your contribution.

We may ask you to sign a [Contributor License Agreement (CLA)](http://en.wikipedia.org/wiki/Contributor_License_Agreement) for larger changes.
