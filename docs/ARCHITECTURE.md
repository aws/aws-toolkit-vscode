# Architecture

An overview of the architecture for various components within the Toolkit.

## Webviews

The current implementation uses Vue 3 with Single File Components (SFCs) for modularity. Each webview
is bundled into a single file and packaged into the toolkit at release time. Each component is able to
act independently, however, they must respect the following principles:

1. State can only be stored in a child component if it is not being used for two-way communication (via events)
2. If there is two-way communication, store state in the parent
3. Data should flow down, actions should flow up

Be very mindful about state managment; violating these principles will lead to buggy and hard-to-debug software.

### Client/Server

The VS Code API restricts our Webviews to a single `postMessage` function. To simplify developing Webviews, we use a basic client/server architecture to handle message passing between the view and the extension.

Webview (frontend) clients can be created via `WebviewClientFactory`. This generates a very simple Proxy to send messages to the extension, mapping the function name to the command name. Unique IDs are also generated to stop requests from receiving extraneous responses.

Commands are defined on the backend via `createCommands`. This takes a single argument:
an object where each key is the name of the command and each value is the handler. The return-type of this function should be used in the frontend code.

A basic request/response with error handling:

```ts
client
    .foo()
    .then(response => console.log(response))
    .catch(err => console.log(err))
```

The backend protocol is allowed to throw errors. These result in rejected Promises on the frontend.

Ocassionally we want to listen for messages without necessarily sending a message. In this case the backend protocol can define event functions.

Handling events:

```ts
client.onBar(message => console.log(message))
```
