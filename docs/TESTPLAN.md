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

The test suite has two categories of tests:

-   Unit Tests: **fast** tests
    -   Live in `src/test/`
    -   The `vscode` API is available.
    -   The Toolkit code is invoked as a library, not as an extension activated in VSCode's typical lifecycle.
    -   Call functions and create objects directly.
    -   May mock state where needed, though this is discouraged in favor of "fake" data/objects/files.
    -   May use the filesystem.
    -   Main property is that [the test is fast](https://pycon-2012-notes.readthedocs.io/en/latest/fast_tests_slow_tests.html).
    -   Global state is shared across tests, thus there is a risk that later tests are polluted by earlier tests.
-   Integration Tests: **slow** tests
    -   Live in `src/integrationTest/`
    -   Use a full instance of VSCode with an activated instance of the extension.
    -   Global state is shared across tests, thus there is a risk that later tests are polluted by earlier tests.
    -   Trigger VSCode commands and UI elements to test codepaths as from an actual user session, instead of invoking functions directly.
    -   Do not use mocks.

## Test files

-   `src/test/` : unit tests
    -   `src/test/globalSetup.test.ts` :
        -   defines global setup functions run before and after each test
        -   defines global utility functions such as `getTestLogger()`
-   `src/integrationTest/` : integration tests
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

## Best Practices

-   Use `function ()` and `async function ()` syntax for `describe()` and `it()` callbacks [instead of arrow functions.](https://mochajs.org/#arrow-functions)
-   Do NOT include any `await` functions in `describe()` blocks directly (usage within `before`, `beforeEach`, `after`, `afterEach`, and `it` blocks are fine).
    -   This will cause the toolkit to always evaluate the `describe` block and can cause issues with either tests not running or tests always running (if other tests are running with `.only`)
    -   Tests that require an premade value from a Promise should initialize the value as a `let` and make the `await`ed call in the `before()` statement.
-   Remember to clean up any `.only()` statements before pushing into PRs! Otherwise, the full suite of tests won't work.

## Testing Gaps

-   No handling of case where VSCode crashes.
-   Test harness hangs forever if VSCode hangs.
-   No end-to-end testing which make web requests to AWS.
-   Many failure modes (as opposed to the "happy path") are not tested.
-   No performance/benchmark regression tests.
-   No UI tests (to exercise webviews).
-   Missing acceptance tests:
    -   Connect to AWS
    -   Fixed credentials and fixed credentials with assume roles
