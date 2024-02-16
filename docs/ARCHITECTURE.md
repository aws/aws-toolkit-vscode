# Architecture

An overview of the architecture for various components within the Toolkit.

## Monorepo Structure

This project is currently set up as a typescript monorepo with a single subproject.
We are currently working on splitting the Toolkit into various subprojects to help with
sharing code between modules, browser extension development, etc. For now, there is just
one monolithic subproject with all the extension functionality: [`packages/toolkit/`](./packages/toolkit/).

Unless otherwise stated, the documentation throughout this project is referring to the code and
functionality of that subproject.

Current quirks of the current monorepo status that should be resolved/evaluated in later versions (TODO):

-   [**Running the test suites in VSCode has changed**](../CONTRIBUTING.md#test)
-   The [root package.json](../package.json) contains common dependencies for subprojects, and workspace
    entries for each of the subprojects.
    -   This package contains shortcuts to some of the `npm` scripts found in the subproject(s).
    -   Other scripts, like `createRelease` and `newChange` run at the root level.
    -   To run a script not present in the root `package.json`, use `npm run -w packages/toolkit <script>`
-   `coverage/`, `.test-reports/`, `node_modules/` are hoisted to the project root. As more subprojects are added,
    we will need to evaluate how to merge and publish coverage reports.
    -   `dist/` however remains at the subproject level, along with a local `node_modules/`. See [`npm workspaces`](https://docs.npmjs.com/cli/v8/using-npm/workspaces)
        for more info on how `node_modules/` hoisting works.
    -   Because of `node_modules/` hoisting, references to this folder in code access the root project modules folder. This may be
        an issue if more subprojects are added and the contents of the root and local modules folders differ.
-   [`globalSetup.test.ts`](../packages/toolkit/src/test/globalSetup.test.ts) should be configured to work as a library/run tests for all subprojects.
-   Subproject `tsconfig.json`s should extend a root `tsconfig.packages.json`.
-   Linting tests should run at the root level, not subproject level.
-   `packages/toolkit/scripts/` should be generalized and moved to the root of the project as needed.
-   LICENSE, README.md, and other non-code artifacts that must be packaged into the .vsix are currently
    being copied into the packaging subproject directory from the root project directory as part of the `copyFiles` task.
-   Pre-release only publishes packages/toolkit extension directly. It should be extended to other added extensions. See [`release.yml`](../.github/workflows/release.yml)
-   VSCode does not support inheriting/extending `.vscode/` settings: https://github.com/microsoft/vscode/issues/15909

## Commands

Many parts of the VS Code API relies on the use of 'commands' which are simply functions bound to a global ID. For small projects, this simplicity is great. But the base API doesn't offer a lot of common functionality that a large project might want: logging, error handling, etc.

For the Toolkit, common command functionality is implemented in [Commands](../packages/toolkit/src/shared/vscode/commands2.ts). The goal with this abstraction is to increase consistency across the Toolkit for anything related to commands.

### Examples

-   Registering and execution:

    ```ts
    const command = Commands.register('helloWorld', () => console.log('Hello, World!'))
    command.execute()
    ```

-   Using parameters:

    ```ts
    const showMessage = async (message: string) => vscode.window.showInformationMessage(message)
    const command = Commands.register('aws.showMessage', showMessage)
    command.execute('Hello, World!')
    ```

-   Creating a CodeLens:

    ```ts
    // The built CodeLens should be returned through a `vscode.CodeLensProvider` implementation
    const range = new vscode.Range(0, 0, 0, 0)
    const lens = command.build('Hello, World!').asCodeLens(range, { title: 'Click me!' })
    ```

-   Creating a tree node:

    ```ts
    // `node` will execute the command when clicked in the explorer tree
    // This object should be returned as a child of some other tree node
    const node = command.build('Hello, World!').asTreeNode({ label: 'Click me!' })
    ```

### Advanced Uses

Complex programs often require more than just simple functions to act as entry-points. Large amounts of state may be involved, which can be very difficult to test and reason about without proper management. One way to make it easier to isolate state from a given command is by 'declaring' it. This associates a command with all the required dependencies while still making it look like any other command.

-   Command declaration and registration:

    ```ts
    const command = Commands.declare('aws.showMessage2', (state: Record<string, string>) => (key: string) => {
        return showMessage(state[key] ?? 'Message not found')
    })

    command.register({ hello: 'Hello, World!', goodbye: 'Goodbye, World!' })
    command.execute('goodbye')
    ```

-   Prototype binding:

    ```ts
    // This class won't show duplicate messages that use the same key unlike the previous example
    class Messages {
        private readonly shown = new Map<string, Promise<unknown>>()
        public constructor(private readonly state: Record<string, string>) {}

        public showMessage(key: string) {
            const promise = this.shown.get(key) ?? showMessage(this.state[key] ?? 'Message not found')
            this.shown.set(
                key,
                promise.finally(() => this.shown.delete(key))
            )

            return promise
        }
    }

    const command = Commands.from(Messages).declareShowMessage('aws.showMessage3')
    const messages = new Messages({ hello: 'Hello, World!', goodbye: 'Goodbye, World!' })

    command.register(messages)
    command.execute('goodbye')
    command.execute('hello')
    command.execute('goodbye')
    ```

## Exceptions

_See also [CODE_GUIDELINES.md](./CODE_GUIDELINES.md#exceptions)._

Large applications often have a correspondingly large number of failure points. For feature-level logic, these failures are often non-recoverable. The best we can do is show the user that something went wrong and maybe offer guidance on how to fix it.

Because this is such a common pattern, shared error handling logic is defined by `ToolkitError` found [here](../packages/toolkit/src/shared/errors.ts). This class provides the basic structure for errors throughout the Toolkit.

### Chaining

Exceptions that occur deep in a call stack often do not contain enough context to correctly diagnose the problem. A stack trace is helpful, but only if the reader has access to both the source code and source map.

By adding additional information as the exception bubbles up, we can create a better view of the program state when the problem occured. This is done via `ToolkitError.chain`. The `chain` function serves as a standard way to establish a clear cause-and-effect relationship for errors.

### Handlers

Any code paths exercised via `Commands` will have errors handled by `handleError` in [extensions.ts](../packages/toolkit/src/extension.ts). A better API for error handling across more than just commands will be added in a future PR.

### Best Practices

Implementations still need to adhere to some basic principles for this to work nicely:

-   Do not catch errors unless something meaningful can be added.
-   Do not swallow errors unless the functionality is non-critical to the feature.
-   Do not directly show the user an error message for failed actions. Use `ToolkitError` instead.
-   Use `chain` when re-throwing errors with additional information.
-   Use `CancellationError` for explicit workflow cancellations.
-   Define meaninful error codes when creating new errors.

## Webviews (Vue framework)

The current implementation uses Vue 3 with Single File Components (SFCs) for modularity. Each webview
is bundled into a single file and packaged into the toolkit at release time. Vue applications may be composed
of individual components in a parent/child heiracrchy. Each component is able to act independently within an
application, however, they must respect the following principles:

1. State can only be stored in a child component if it is not being used for two-way communication (via events)
2. If there is two-way communication, store state in the parent
3. Data should flow down, actions should flow up

Be very mindful about state managment; violating these principles will lead to buggy and hard-to-debug software.

### Bundling

Each webview is bundled into a single file to speed up load times as well as isolate the 'web' modules from the 'node' modules. Webview bundles are automatically generated on compilation by targeting `index.ts` files when located under a `vue` directory. All bundles are placed under `dist` in the same relative location.

Generated bundle names map based off their path relative to `src`: `src/foo/vue/bar/index.ts` -> `dist/src/foo/vue/bar/index.js`

Running the extension in development mode (e.g. via the `Extension` launch task) starts a local server to automatically rebuild and serve webviews in real-time via hot-module reloading. It's assumed that the server runs on port `8080`, so make sure that nothing is already using that port. Otherwise webviews will not be displayed during development.

### Client/Server

The VS Code API restricts our Webviews to a single `postMessage` function. To simplify developing Webviews, we use a client/server architecture to handle message passing between the view and the extension. This does not mean that clients are restricted to 1 message = 1 response, rather, the frontend ("client") needs to send the first message.

Webview (frontend) clients can be created via `WebviewClientFactory`. This generates a simple Proxy to send messages to the extension, mapping the function name to the command name. Unique IDs are also generated to stop requests from receiving extraneous responses. It is **highly** recommended to use the [Volar](https://marketplace.visualstudio.com/items?itemName=johnsoncodehk.volar) extension for syntax highlighting and type-checking when working with SFCs. Keep in mind that this is purely a development tool: users of the toolkits do not require Volar to view webviews.

Commands and events are defined on the backend via sub-classes of `VueWebview`. Classes define all the functions and events that will be available to the frontend. These sub-classes can be turned into a fully-resolved class by using either `VueWeview.compilePanel` or `VueWebview.compileView`. The resulting classes can finally be used to instantiate webview panels or view. Panels are shown by calling `show`, while views must be registered before they can be seen.

### Examples

-   Creating and executing a webview:

    ```ts
    // Export the class so the frontend code can use it for types
    export class MyVueWebview extends VueWebview {
        public readonly id = 'my.view'
        public readonly source = 'myView.js'
        public readonly onBar = new vscode.EventEmitter<number>()

        public constructor(private readonly myData: string) {}

        public init() {
            return this.myData
        }

        public foo() {
            return 'foo'
        }

        public bar() {
            this.onBar.fire(0)
        }
    }

    // Create panel bindings using our class
    const Panel = VueWebview.compilePanel(MyVueWebview)

    // `context` is `ExtContext` provided on activation
    const view = new Panel(context, 'hello')
    view.show({ title: 'My title' })
    view.server.onFoo.fire(1)
    ```

-   Creating the client on the frontend:

    ```ts
    import { MyView } from './backend.ts'
    const client = WebviewClientFactory.create<MyView>()
    ```

-   A basic request/response with error handling:

    ```ts
    client
        .foo()
        .then(response => console.log(response))
        .catch(err => console.log(err))
    ```

    The backend protocol is allowed to throw errors. These result in rejected Promises on the frontend.

-   Registering for events:

    ```ts
    client.onBar(num => console.log(num))
    ```

-   Methods called `init` will only return data on the initial webview load:

    ```ts
    client.init(data => (this.data = data ?? this.data))
    ```

### Testing

Currently only manual testing is done. Future work will include setting up some basic unit testing capacity via `JSDOM` and `Vue Testing Library`. Strict type-checking may also be enforced on SFCs; currently the type-checking only exists locally due to gaps in the type definitions for the DOM provided by Vue/TypeScript.

## Prompters

A 'prompter' can be thought of as any UI element that displays ('prompts') the user to make some choice or selection, returning their response. This interface is captured with the abstract base class `Prompter` which also contains some extra logic for convenience. Instances of the class can be used alone by calling the async method `prompt`, or by feeding them into a `Wizard`.

```ts
const prompter = createInputBox()
const response = await prompter.prompt()

// Verify that the user did not cancel the prompt
if (isValidResponse(response)) {
    // `response` is now typed as `string`
}
```

### Quick Picks

Pickers can be constructed by using the `createQuickPick` factory function. This currently takes two parameters: a collection of 'items' (required), and an object defining additional options. The items can be an array, a Promise for an array, or an `AsyncIterable`. All collections should resolve to the `DataQuickPickItem` interface. Extra configuration options are derived from valid properties on VS Code's `QuickPick` interface, e.g. `title` sets the title of the resulting picker. Some extra options are also present that change or enhance the default behavior of the picker. For example, using `filterBoxInputSettings` causes the picker to create a new quick pick item based off the user's input.

#### Items

A picker item is simply an extension of VS Code's `QuickPickItem` interface, encapsulating the data it represents in the aptly named `data` field:

```ts
// This can be typed as `DataQuickPickItem<string>`
const item = {
    label: 'An item'
    data: 'some data'
}
```

If the user selects this item, then 'some data' should be returned. Note that the type of data (and therefore type of `Prompter`) can largely be inferred; explicit typing, if done at all, should be limited to item definitions:

```ts
// Results in `QuickPickPrompter<string>`
const prompter = createQuickPick([item])

// Results in `QuickPickPrompter<number>`
const prompter = createQuickPick([{ label: 'Another item', data: 0 }])
```

Often we deal with items derived asychronously (usually by API calls). `createQuickPick` can handle this scenario, showing a loading bar while items load in. For example, consider a scenario where we want to show the user a list of CloudWatch log groups to select. In this case the API is _paginated_, so we should use the `pageableToCollection` utility method to make it easier to map:

```ts
interface LogGroup extends CloudWatchLogs.LogGroup {
    logGroupName: string
    storedBytes: number
}
function isValidLogGroup(obj?: CloudWatchLogs.LogGroup): obj is LogGroup {
    return !!obj && typeof obj.logGroupName === 'string' && typeof obj.storedBytes === 'number'
}

const requester = (request: CloudWatchLogs.DescribeLogGroupsRequest) =>
    client.invokeDescribeLogGroups(request, sdkClient)
const collection = pageableToCollection(requester, request, 'nextToken', 'logGroups')

const groupToItem = (group: LogGroup) => ({ label: group.logGroupName, data: group })
const items = collection.flatten().filter(isValidLogGroup).map(groupToItem)
const prompter = createQuickPick(items) // Results in `QuickPickPrompter<LogGroup>`
```

If we did not care about pagination, we could call the `promise` method on `collection`, causing all items to load in at once:

```ts
const items = collection.flatten().filter(isValidLogGroup).map(groupToItem).promise()
const prompter = createQuickPick(items) // Results in `QuickPickPrompter<LogGroup>`
```

### Input Box

A new input box prompter can be created using the `createInputBox` factory function. Like `createQuickPick`, the input is derived from the properties of VS Code's `InputBox` interface.

### Testing

Quick pick prompters can be tested using `createQuickPickTester`, returning an interface that executes actions on the picker. This currently acts on the real VS Code API, meaning the actions happen asynchronously. Very basic example:

```ts
const items = [
    { label: '1', data: 1 },
    { label: '2', data: 2 },
]
const tester = createQuickPickTester(createQuickPick(items))

tester.assertItems(['1', '2']) // Assert that the prompt displays exactly two items with labels '1' and '2'.
tester.acceptItem('1') // Accept an item with label '1'. This will fail if no item is found.
await tester.result(items[0].data) // Execute the actions, asserting the final result is equivalent to the first item's data
```

## Wizards

Abstractly, a 'wizard' is a collection of discrete, linear steps (subroutines), where each step can potentially be dependent on prior steps, that results in some final state. Wizards are extremely common in top-level flows such as creating a new resource, deployments, or confirmation messages. For these kinds of flows, we have a shared `Wizard` class that handles the bulk of control flow and state management logic for us.

### Creating a Wizard (Quick Picks)

A new wizard can be created by extending off the base `Wizard` class, using the template type to specify the shape of the wizard state. All wizards have an internal 'form' property that is used to assign steps. We can assign UI elements (namely, quick picks) using the `bindPrompter` method on form elements. This method accepts a callback that should return a `Prompter` given the current state. For this example, we will use `createQuickPick` and `createInputBox` for our prompters:

```ts
interface ExampleState {
    foo: string
    bar?: number
}

class ExampleWizard extends Wizard<ExampleState> {
    public constructor() {
        super()

        // Note that steps should only be assigned in the constructor by convention
        // This first step will always be shown as we did not specify any dependencies
        this.form.foo.bindPrompter(() => createInputBox({ title: 'Enter a string' }))

        // Our second step is only shown if the length of `foo` is greater than 5
        // Because of this, we typed `bar` as potentially being `undefined` in `ExampleState`
        const items = [
            { label: '1', data: 1 },
            { label: '2', data: 2 },
        ]
        this.form.bar.bindPrompter(state => createQuickPick(items, { title: `Select a number (${state.foo})` }), {
            showWhen: state => state.foo?.length > 5,
        })
    }
}
```

### Executing

Wizards can be ran by calling the async `run` method:

```ts
const wizard = new ExampleWizard()
const result = await wizard.run()
```

Note that all wizards can potentially return `undefined` if the workflow was cancelled.

### Testing

Use `createWizardTester` on an instance of a wizard. Tests can then be constructed by asserting both the user-defined and internal state. Using the above `ExampleWizard`:

```ts
const tester = createWizardTester(new ExampleWizard())
tester.foo.assertShowFirst() // Fails if `foo` is not shown (or not shown first)
tester.bar.assertDoesNotShow() // True since `foo` is not assigned an explicit value
tester.foo.applyInput('Hello, world!') // Manipulate 'user' state
tester.bar.assertShow() // True since 'foo' has a defined value
```
