# Architecture

An overview of the architecture for various components within the Toolkit.

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

Each webview is bundled into a single file to speed up load times as well as isolate the 'web' modules from the 'node' modules. Webview bundles are automatically generated on compilation by targeting `entry.ts` files when located under a `vue` directory. All bundles are placed directly under `dist`.

Generated bundle names map based off their path relative to `src`: `src/foo/vue/bar/entry.ts` -> `fooBarVue.js`

Running the extension in development mode (e.g. via the `Extension` launch task) starts a local server to automatically rebuild and serve webviews in real-time via hot-module reloading.

### Client/Server

The VS Code API restricts our Webviews to a single `postMessage` function. To simplify developing Webviews, we use a client/server architecture to handle message passing between the view and the extension. This does not mean that clients are restricted to 1 message = 1 response, rather, the frontend ("client")
needs to send the first message.

Webview (frontend) clients can be created via `WebviewClientFactory`. This generates a simple Proxy to send messages to the extension, mapping the function name to the command name. Unique IDs are also generated to stop requests from receiving extraneous responses. It is **highly** recommened to use the [Volar](https://marketplace.visualstudio.com/items?itemName=johnsoncodehk.volar) extension for syntax highlighting and type-checking when working with SFCs.

Commands and events are defined on the backend via `compileVueWebview` or `compileVueWebviewView` for the special view case. This takes a configuration object that contains information about the webview, such as the
name of the main script, the panel id, and the commands/events that the backend provides. This returns a class that can be instantiated into the webview. Webviews can then be executed by calling `start` with any initial data (if applicable). Webviews can be cleared of their internal state without reloading the HTML by calling `clear` with any re-initialization data (if applicable).

### Examples

-   Creating and executing a webview:

    ```ts
    const VueWebview = compileVueWebview({
        id: 'my.view',
        title: 'A title',
        webviewJs: 'myView.js',
        start: (param?: string) => param ?? 'foo',
        events: {
            onBar: new vscode.EventEmitter<number>(),
        },
        commands: {
            foo: () => 'hello!',
        },
    })

    // `context` is `ExtContext` provided on activation
    const view = new VueWebview(context)
    view.start('some data')
    view.emitters.onFoo.fire(1)

    // Export a class so the frontend code can use it for types
    export class MyView extends VueWebview {}
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

-   Retrieving initialization data by calling the `init` method:

    ```ts
    client.init(data => console.log(data))
    ```

    Note that data is retrieved only **once**. Subsequent calls made by the same webview resolve `undefined` unless the state is cleared either by `clear` or refreshing the view.

-   Submitting a result (this destroys the view on success):

    ```ts
    client.submit(result).catch(err => console.error('Something went wrong!'))
    ```

    `submit` does nothing on views registered as a `WebviewView` as they cannot be disposed of by the extension.

### Testing

Currently only manual testing is done. Future work will include setting up some basic unit testing capacity via `JSDOM` and `Vue Testing Library`. Strict type-checking may also be enforced on SFCs; currently the type-checking only exists locally due to gaps in the type definitions for the DOM provided by Vue/TypeScript.
