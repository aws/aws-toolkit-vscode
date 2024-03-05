# Guidelines

This document describes code guidelines and technical considerations for AWS
Toolkit for VSCode. It provides answers to common questions, decisions, UX and
project consistency, questions of style and code structure, and anything else
that cannot be enforced by a `lint` build-task.

## UI

-   Where possible, follow the conventions of the [VSCode User Interface](https://code.visualstudio.com/docs/getstarted/userinterface)
    instead of inventing new conventions.
-   Convention: provide global editor commands as an alternative to browsing items in the Explorer.
    -   Instead of needing to visit service _Foo_ in the Explorer to _View_ its items, consider also providing a `AWS: Foo: View Item` command.
-   [Webview guidance](https://code.visualstudio.com/api/ux-guidelines/webviews)
-   Webview costs:
    -   Webviews very easily lead to the [inner-platform effect](https://en.wikipedia.org/wiki/Inner-platform_effect).
        Because they are fully isolated from vscode and its extensions, they must include any code
        and frameworks.
    -   Leads to extra dependencies.
    -   Webviews inherit none of vscode's standard features. This means features like keyboard
        shortcuts, syntax highlighting, and editor navigation, are not available to users. Instead
        users must learn the custom _web application_ embedded in the webview.

## Dependencies

Dependencies can be very high-leverage if they solve a difficult problem.
Dependencies are also a [maintenance burden](https://github.com/aws/aws-toolkit-vscode/pulls?q=is%3Apr+author%3Aapp%2Fdependabot+is%3Aclosed) and security risk
Copy-pasting or "inlining" a dependency doesn't solve that, of course--it only hides the problem (another cost).
So before taking on a new dependency, ask:

-   is this solving a problem that is worth the cost?
-   could the problem be solved in some other way that involves a smaller cost? For example, using
    an isolated function with good test coverage, or a native vscode feature such as a TreeView or
    quickpick menu.

## Naming

Naming is one of the central opportunities for you as a human to add value to
a project. Over-specifying names ("premature explanation") is a common habit
that is a net cost.

> The precision of naming takes away from the uniqueness of seeing.
> ― Pierre Bonnard

-   Do not use "AWS" in command names. The "AWS" brand is [not used China](https://github.com/aws/aws-toolkit-vscode/pull/1786).
    It's very confusing (for documentation, community guidance, etc.) to have
    different command names (in the _same_ language) for different regions.
-   Use consistent patterns for similar concepts.
    -   Example: `getLambdaFileName` vs `parseLambdaDetailsFromConfiguration`
        -   Using "get" as a verb is useful because it has parallel form with other
            similar "get" functions in this family: `getResourceFromTemplate`,
            `getRuntime`, etc.
        -   They aren't in the same modules. But they are similar concepts. This
            helps discoverability and signals to other humans the behavior of the
            symbols without having to consume the implementation.
-   Use common names unless there is a strong, conscious reason to use
    a variant/uncommon name.
    -   "Info" is more common that "Details".
    -   "Get" is more common than "Retrieve"
        -   "Fetch" might be used to indicate that special work is being done vs
            some other existing (or potential) "Get" counterpart in the same
            module. Ask: If the function is _not_ doing special work then why is
            it named "Fetch" instead of "Get"?
-   Over-specifying names:
    -   Counteracts re-use and discoverability
    -   Creates churn when the implementation changes, because then the name
        needs to change (it doesn't matter that `getLambdaFileName` is "parsing"
        its input--unless parsing is a central requirement of the function, and
        differentiates it from other similar functions).
-   _Most_ code related to topic "Foo" should live in `foo.ts`.
    -   "Utility" functions:
        -   Code related to "Foo" but (1) not strongly dependent on its types,
            and (2) broadly usable by other modules, may live in
            `src/utilities/foo.ts`.
        -   Code related to "Foo" that _is strongly dependent_ on its types, may
            live in `src/foo/util.ts`.
        -   `src/foo/utilities/` is never (in a project <1M LoC) needed.

## Project guidelines

-   Telemetry: "active" vs "passive"
    -   Active (`passive:false`) metrics are those intended to appear in DAU count.
-   Icons:
    -   Where possible, use IDE-specific standard icons (e.g. standard VSCode
        standard icons in VSCode, and Cloud9 standard icons in Cloud9). The typical
        (maintainable) way to do this is to use _named_ icons (what VSCode calls
        [codicons](https://microsoft.github.io/vscode-codicons/)) as opposed to
        icons shipped with the Toolkit build and referenced by _path_.
    -   For cases where icons must be statically defined (package.json), if Cloud9
        does not support the VSCode standard icon, use the Cloud9 icon.
-   Changelog guidelines
    -   Prefer active voice: "You can do X" instead of "X can be done"
-   Avoid unnecessary use of `lodash` (which we may remove in the future).
    Functions such as `forEach()`, `map()`, `filter()`, and many others are
    already available from ES6/typescript.
-   Do not habitually define concepts one-per-file. Related classes, interfaces,
    and symbols should live in the same module unless there is an explicit,
    conscious motivation for separating them.
-   Use the `ClassToInterfaceType` type alias when an interface that directly
    corresponds to a class is needed. This keeps things organized and reduces
    the number of changes required when the implementation is modified.
-   What is a "unit test"? <https://www.youtube.com/watch?v=EZ05e7EMOLM>
    -   Unit is not "a single class", it's a piece of the software with a clear
        boundary. It might be a whole microservice, or a chunk of a monolith that
        is internally consistent.
-   User-facing messages (and log messages):
    -   Put the variable part of a message at the end, preceded by a colon.
        -   `'foo failed: {0}'`
    -   If a message has many variable parts, mention them in the message in
        a natural way, but surround them with quotes:
        -   `'creating "{0}" in directory: {1}'`
    -   Localize UI messages. Do _not_ localize log and exception messages.
    -   Use `extensionUtilities.getIdeProperties()` to automatically match IDE
        terminology (e.g. VS Code : CodeLens :: AWS Cloud9 : Inline Action)
-   Refactoring tools allow us to avoid "premature abstraction". Avoid wrappers
    or other abstractions until the need is clear and obvious.

### Exceptions

_See also [ARCHITECTURE.md](./ARCHITECTURE.md#exceptions)._

-   Bubble-up error conditions, do not sink them to random hidden places (such as
    logs only), expecting callers to figure out the failure mode. If a caller
    spawns a process that fails, the caller should get an exception, callback, or
    return value indicating that some descendant in the call-chain failed, with
    the failure reason.
-   Handle errors by acting on them. Code should only catch errors if they are
    able to react to them in some way. This could be showing an error message,
    attaching metadata to the error, or retrying the failed action. Do not just
    log and rethrow the error without additional context as to where the error occured.
-   Do not log a stack trace unless it's truly a fatal exception. Stack traces are
    noisy and mostly useless in production because the extension is bundled
    (webpacked), removing anything useful from the trace.
    -   When _debugging_ the extension, you can tell the debugger to break on
        exceptions, so logging the stacktrace is unnecessary there.
-   Do not use multiple logger calls to log what is semantically a single
    message. Use a string template or printf-style syntax (`%s` ) to format the
    message:
    -   GOOD:
        ```
        getLogger().error(`Failed to create %s: %s`, foo, (err as Error).message)
        ```
    -   BAD:
        ```
        getLogger().error(`Failed to create %s`, foo)
        getLogger().error(err)
        ```

## Test guidelines

-   Test real codepaths, avoid mocks.
    -   Example 1: instead of mocking various aspects of the `sam local invoke`
        codepath, assert the string representation of the CLI command generated by
        `samCliBuild.ts`
    -   Example 2: instead of mocking various aspects of `sam local invoke`
        codepath, shift all CONFIG decisions earlier in the codepath and test the
        real values.
    -   Both examples result in faster, more-readable, more-useful tests, and more
        test-coverage of real codepaths.
-   Use `createQuickPickTester` to test quick picks via `QuickPickPrompter` implementations.

    -   Tests are constructed as a series of 'actions' to simulate user interaction
        with the UI element. Presentation as well as behavior may be tested this way.
    -   Example of a test set-up:

        ```ts
        const prompter = createRegionPrompter(regions, {
            title: 'Select region',
            buttons: createCommonButtons('https://aws.amazon.com/'),
            defaultRegion: 'foo-bar-1',
        })
        const tester = createQuickPickTester(prompter)
        ```

    -   Example of a basic unit test:

        ```ts
        it('prompts for region', async function () {
            tester.acceptItem('foo-bar-1')
            await tester.result(regions[2])
        })
        ```

    -   [Testing Refresh Button](https://github.com/aws/aws-toolkit-vscode/blob/b34c8f7650c862c388992781844695b014b5d974/src/test/shared/ui/prompters/rolePrompter.test.ts#L58-L65)

-   Use [`testCommand`](../packages/core/src/test/shared/vscode/testUtils.ts) for testing commands created by `Commands.declare`
    -   Prefer executing the real command directly when possible

## Code guidelines

-   Use maps to group variables, rather than ad-hoc/informal grouping.
    [Example](https://github.com/aws/aws-toolkit-vscode/blob/abed2c4c7e1329da785190e286e567525afa9da5/src/test/shared/utilities/timeoutUtils.test.ts#L107-L113)

    -   PREFER:

        ```ts
        let topic = {
            var1 = 'foo',
            var2 = 'bar',
        }
        ```

    -   INSTEAD OF:
        ```ts
        let topicVar1 = 'foo'
        let topicVar2 = 'bar'
        ```

-   Where formal grouping is not possible, use a common prefix in names to help
    discoverability and help other developers understand "these symbols are
    related".

    -   PREFER:
        ```ts
        export interface AwsSamDebuggerConfigLoose extends AwsSamDebuggerConfig {
          ...
        }
        ```
    -   INSTEAD OF:
        ```ts
        export interface MorePermissiveAwsSamDebuggerConfig extends AwsSamDebuggerConfig {
          ...
        }
        ```

-   Use module-qualified names, to avoid aliasing members.

    -   PREFER:
        ```ts
        import * as foo from '../foo'
        const result = foo.Result
        ```
    -   INSTEAD OF:
        ```ts
        import { Result as FooResult } from '../foo'
        const result = FooResult
        ```

-   Use small names for small scopes.

    -   PREFER:
        ```ts
        things.filter(o => o.isFoo)
        ```
    -   INSTEAD OF:
        ```ts
        things.filter(thing => thing.isFoo)
        ```

## User settings

This codebase offers some convenient abstractions for manipulating user settings. The implementations and relevant documenation can be found [here](https://github.com/aws/aws-toolkit-vscode/blob/479b9d45b5f5ad30fc10567e649b59801053aeba/src/shared/settings.ts).

-   Prefer using shared abstractions when possible. Many cross-cutting concerns, such as logging and validation, are handled automatically.

-   Use "workspace" scope for automated tests, or an [in-memory implementation](https://github.com/aws/aws-toolkit-vscode/blob/479b9d45b5f5ad30fc10567e649b59801053aeba/src/test/utilities/testSettingsConfiguration.ts). Otherwise developers running the tests will have their settings changed!

### Technical Notes

-   Global scope is shared across all vscode instances _including_ remote/SSH
    instances. Programmatically setting a Global scope config value will raise
    the onDidChangeConfiguration event for all (local and remote) vscode
    instances.
-   <https://github.com/clangd/vscode-clangd/issues/25#issuecomment-627505249>

    > We write clangd.path to the user config (local ~/.config/Code/settings.json)
    > rather than the machine config (remote ~/.vscode-server/data/Machine/settings.json).
    > This has two problems:
    >
    > 1. if you already have a clangd.path in your remote workspace config, then it
    >    will take precedence over the local user one.
    > 2. setting clangd.path in your local config, to a path that isn't present
    >    on the local machine, means that local clangd won't work.

-   Commit introducing machine scope: <https://github.com/microsoft/vscode/commit/1fd2993b540ccf11c34234774f7cc53825d60edf>
-   Explanation of VSCode settings hierarchy: <https://github.com/microsoft/vscode/issues/97616#issuecomment-633671266>
    -   package.json scope=machine : <https://code.visualstudio.com/api/references/contribution-points#Configuration-property-schema>
-   Example: consider the "User" and "Remote" tabs in the VSCode settings UI.
    Say `clangd.path` that is defined as "machine" scope.
    -   In a Local workspace, the setting is applied if it is defined in User settings.
    -   In a Remote workspace, the setting is applied if it is defined in Remote settings and the value defined in User settings is ignored.
        If the extension uses this code (note `Global`):
        vscode.workspace.getConfiguration('clangd').update('path', xxx, vscode.ConfigurationTarget.Global)
    -   ...in a Local workspace, VSCode writes the value into user settings
    -   ...in a Remote workspace, VSCode writes the value into remote user settings
