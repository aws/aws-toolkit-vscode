# Web

There is currently no reason to add any other files to this folder other than `package.json`.

## `package.json`

To create a separation of concerns, we put web specific dependencies in the [web
`package.json`](./package.json) from the [root `package.json`](../../package.json). Now web
specific dependencies aren't mixed in with the non-web specific dependencies in the root.

To do this we use the built-in `npm` [`workspace`](https://docs.npmjs.com/cli/v7/using-npm/workspaces) functionality, which allows us to create linked packages within the same project.
Now, an `npm install` will install all dependencies from the root `package.json` as well as all
dependencies from the workspace `package.json`s in a single go.

### How to add a Web specific dependency

While in the project root, run `npm install {MODULE} --workspace packages/core/src/web`.
