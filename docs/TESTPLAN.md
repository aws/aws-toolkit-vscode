# Test Plan

This document describes the testing architecture, goals and current status for
the AWS Toolkit for VSCode.

## Test goals

In order of priority:

1. Fast feedback from making a code change to seeing a result
2. High confidence in releasing the Toolkit
3. Avoid regressions

Ratio of unit to integ tests: 90% unit tests, 10% system/acceptance tests.

## Test categories

The test suite has the following categories of tests:

-   Unit Tests: **fast** tests
    -   Live in `src/test/`
    -   The `vscode` API is available.
        -   Use `getTestWindow()` to inspect or manipulate `vscode.window`
    -   The Toolkit code is invoked as a library, not as an extension activated in VSCode's typical lifecycle.
    -   Call functions and create objects directly.
    -   May mock state where needed, though this is discouraged in favor of "fake" data/objects/files.
    -   May use the filesystem.
    -   Main property is that [the test is fast](https://pycon-2012-notes.readthedocs.io/en/latest/fast_tests_slow_tests.html).
    -   Global state is shared across tests, thus there is a risk that later tests are polluted by earlier tests.
-   Lint Tests:
    -   Live in `src/testLint`
    -   Can run from CLI with `npm run lint`
    -   Any type of test related to the format/quality/content of the code
    -   Does not have context of the `vscode` api
-   Integration Tests: **slow** tests
    -   Live in `src/testInteg/`
    -   Use a full instance of VSCode with an activated instance of the extension.
    -   Global state is shared across tests, thus there is a risk that later tests are polluted by earlier tests.
    -   Trigger VSCode commands and UI elements to test codepaths as from an actual user session, instead of invoking functions directly.
    -   Do not use mocks.
-   E2E Tests: **slow** tests
    -   Live in `src/testE2E`
    -   These tests are heavier than Integration tests.
    -   Some E2E tests have a more complicated architecture, described in [TEST_E2E](./TEST_E2E.md)

## Test files

Currently, most if not all testing code lives in the subproject `packages/core/`.
For more information, see [arch_develop.md](./arch_develop.md#monorepo-structure)

-   `src/test/` : unit tests
    -   `src/test/globalSetup.test.ts` :
        -   defines global setup functions run before and after each test
        -   defines global utility functions such as `getTestLogger()`
-   `src/testInteg/` : integration tests
-   `src/test/testRunner.ts` : used by _both_ the unit tests and integration
    tests to discover tests, setup the test framework, and run tests.
-   `src/testFixtures/` : test data (sample projects, SAM templates, ...)
    -   used by both unit and integration tests
-   `.vscode/launch.json` : defines VSCode launch configs useful for Toolkit
    developers, e.g. the `Extension Tests` config runs all tests in `src/test/`.

## How we test

VSCode documentation describes an [extension testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
approach. The Toolkit codebase uses that approach, except some
modifications/workarounds in `src/test/testRunner.ts`.

-   We use the [vscode-test](https://github.com/microsoft/vscode-test) package.
    -   [Mocha](https://mochajs.org/) framework is used to write tests.
-   New code requires new tests.

## Testing Gaps

-   No handling of case where VSCode crashes.
-   Test harness hangs forever if VSCode hangs.
-   No end-to-end testing which make web requests to AWS.
-   Many failure modes (as opposed to the "happy path") are not tested.
-   No performance/benchmark regression tests.
-   No UI tests (to exercise webviews).
    -   https://github.com/redhat-developer/vscode-extension-tester
-   Missing acceptance tests:
    -   Connect to AWS
    -   Fixed credentials and fixed credentials with assume roles
-   Testing AWS SDK client functionality is cumbersome, verbose, and low-yield.
-   Test code uses multiple “mocking” frameworks, which is confusing, error-prone, hard to onboard, and hard to use.
-   Coverage not counted for integ tests (because of unresolved tooling issue).
-   [Backlog](https://github.com/aws/aws-toolkit-vscode/blob/0f3685ab0dc8af3a214136ebfa233829d5d72b2c/src/shared/telemetry/exemptMetrics.ts) of metrics that do not pass validation but are temporarily exempted to not fail CI.

## Window

Certain VS Code API calls are not easily controlled programtically. `vscode.window` is a major source of these functions as it is closely related to the UI. To facilitate some semblance of UI testing, all unit tests have access to a proxied `vscode.window` object via `getTestWindow()`.

### Inspecting State

The test window will capture relevant UI state that can be inspected at test time. For example, you can check to see if any messages were shown by looking at `getTestWindow().shownMessages` which is an array of message objects.

Some VS Code API operations do not expose "native" UI elements that can be inspected. In these cases, in-memory test versions have been created. In every other case the native VS Code API is used directly and extended to make them more testable.

### Event-Driven Interactions

Checking the state works well if user interactions are not required by the code being tested. But many times the code will be waiting for the user's response.

To handle this, test code can register event handler that listen for when a certain type of UI element is shown. For example, if we wanted to always accept the first item of a quick pick we can do this:

```ts
getTestWindow().onDidShowQuickPick(async picker => {
    // Some pickers load items asychronously
    // Wait until the picker is not busy before accepting an item
    await picker.untilReady()
    picker.acceptItem(picker.items[0])
})
```

Utility functions related to events can be used to iterate over captured UI elements:

```ts
const pickers = captureEvent(getTestWindow().onDidShowQuickPick)
const firstPicker = await pickers.next()
const secondPicker = await pickers.next()
```

Exceptions thrown within one of these handlers will cause the current test to fail. This allows you to make assertions within the callback without worrying about causing the test to hang.
