# Contributing Guidelines

Thank you for your interest in contributing to our project. Whether it's a bug report, new feature, correction, or additional
documentation, we greatly value feedback and contributions from our community.

Please read through this document before submitting any issues or pull requests to ensure we have all the necessary
information to effectively respond to your bug report or contribution.

## Getting Started

### Setup

Before you start, install the following dependencies.

-   [Visual Studio Code](https://code.visualstudio.com/Download)
-   [NodeJS and NPM](https://nodejs.org/)
    -   NodeJS Version: 10.x
    -   NPM version: 6.4.1 or higher
-   [Typescript](https://www.typescriptlang.org/)
-   [Git](https://git-scm.com/downloads)

Then clone the repository and install npm dependencies:

    cd ~/repos
    git clone git@github.com:aws/aws-toolkit-vscode.git
    cd aws-toolkit-vscode
    npm install

### Build

When you launch the extension or run tests from Visual Studio Code, it will automatically build the extension and watch for changes.

If you prefer, you can build from the command line:

-   To build one time: `npm run compile`
-   To build and watch for file changes: `npm run watch`

#### If you run out of memory while building

Webpack can exhaust the default heap size of Node on Linux. To fix this, add `--max-old-space-size` to the `NODE_OPTIONS` environment variable. For example,

```
export NODE_OPTIONS=--max-old-space-size=8192
```

### Test

You can run tests directly from Visual Studio Code:

1. Select `View > Debug`, or select the Debug pane from the sidebar.
2. From the dropdown at the top of the Debug pane, select the `Extension Tests` configuration.
3. Press `F5` to run tests with the debugger attached.

If you prefer, you can also run tests from the command line:

    npm run test

There are also some integration tests, which can be run from the Debug pane, or from the command line:

    npm run integrationTest

Tests will output log output to `./.test-reports/testLog.log` for debugging

#### Run a specific test

To run a single test, change its `it()` call to `it.only(…)`.

To run a single group of tests, change the `describe()` call to `describe.only(…)`.

To run all tests in a particular subdirectory, you can edit
`src/test/index.ts:rootTestsPath` so that it points to the subdirectory instead
of the top-level directory:

    rootTestsPath: __dirname + '/shared/sam/debugger/'

#### Checking coverage report

After running the tests, the coverage report can be found at ./coverage/index.html

### Run

You can run directly from Visual Studio Code:

1. Select `View > Debug`, or select the Debug pane from the sidebar.
2. From the dropdown at the top of the Debug pane, select the `Extension` configuration.
3. Press `F5` to launch a new instance of Visual Studio Code with the extension installed and the debugger attached.

## Reporting Bugs/Feature Requests

We welcome you to use the GitHub issue tracker to report bugs or suggest features.

When filing an issue, please check [existing open](https://github.com/aws/aws-vscode-toolkit/issues), or [recently closed](https://github.com/aws/aws-vscode-toolkit/issues?utf8=%E2%9C%93&q=is%3Aissue%20is%3Aclosed%20), issues to make sure somebody else hasn't already.
reported the issue. Please try to include as much information as you can. Details like these are incredibly useful:

-   A reproducible test case or series of steps
-   The version of our code being used
-   Any modifications you've made relevant to the bug
-   Anything unusual about your environment or deployment

## Contributing via Pull Requests

Contributions via pull requests are much appreciated. Before sending us a pull request, please ensure that:

1. You are working against the latest source on the _master_ branch.
2. You check existing open, and recently merged, pull requests to make sure someone else hasn't addressed the problem already.
3. You open an issue to discuss any significant work - we would hate for your time to be wasted.

To send us a pull request, please:

1. Fork the repository.
2. Modify the source; please focus on the specific change you are contributing. If you also reformat all the code, it will be hard for us to focus on your change.
3. Ensure local tests pass.
4. Commit to your fork using clear commit messages.
5. Once you are done with your change, run `npm run newChange`, follow the prompts, then commit the changelog item to your fork.
6. Send us a pull request, answering any default questions in the pull request interface.
7. Pay attention to any automated CI failures reported in the pull request, and stay involved in the conversation.

GitHub provides additional document on [forking a repository](https://help.github.com/articles/fork-a-repo/) and
[creating a pull request](https://help.github.com/articles/creating-a-pull-request/).

### Importing icons from other open source repos

If you are contribuing visual assets from other open source repos, the source repo must have a compatible license (such as MIT), and we need to document the source of the images. Follow these steps:

-   A separate location in this repo is used for every repo where images are sourced from. The location is in the form `third-party/resources/from-<BRIEF_REPO_NAME>`
-   Copy the source repo's licence into this destination location's LICENSE.txt file
-   Create a README.md in the destination location, and type in a copyright attribution:

```text
The AWS Toolkit for VS Code includes the following third-party software/licensing:

Icons contained in this folder and subfolders are from <SOURCE_REPO_NAME>: <SOURCE_REPO_URL>

<PASTE_SOURCE_LICENSE_HERE>
```

-   Copy the SVG file(s) into a suitable place within the destination location, for example `.../dark/xyz.svg` and `.../light/xyz.svg`
-   Add an entry to `third-party/README.md` summarizing the new destination location, where the asserts were sourced from, and a brief rationale.

[PR 227](https://github.com/aws/aws-toolkit-vscode/pull/227) illustrates what this looks like in practice.

## Finding contributions to work on

Looking at the existing issues is a great way to find something to contribute on. As our projects, by default, use the default GitHub issue labels ((enhancement/bug/duplicate/help wanted/good first issue/invalid/question/wontfix), looking at any [`good first issue`](https://github.com/aws/aws-toolkit-vscode/labels/good%20first%20issue) or [`help wanted`](https://github.com/aws/aws-toolkit-vscode/labels/help%20wanted) issues is a great place to start.

## Code of Conduct

This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments.

## Security issue notifications

If you discover a potential security issue in this project we ask that you notify AWS/Amazon Security via our [vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a public github issue.

## Licensing

See the [LICENSE](https://github.com/aws/aws-vscode-toolkit/blob/master/LICENSE) file for our project's licensing. We will ask you to confirm the licensing of your contribution.

We may ask you to sign a [Contributor License Agreement (CLA)](http://en.wikipedia.org/wiki/Contributor_License_Agreement) for larger changes.
