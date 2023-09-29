# Browser

This folder should only contain code which must run in the Browser.

For the AWS VS Code Toolkit extension to work in the browser (eg: [vscode.dev](https://vscode.dev/)), we
need to ensure that certain functionality which may have previously only been able to
run in a desktop environment can additionally run in a browser environment.

Functionality will not be immediately available in the browser since the underlying code will need
to be modified to get things working. Functionality will be provided incrementally.

## `package.json`

To create a separation of concerns, we put browser specific dependencies in the [browser
`package.json`](./package.json) from the [root `package.json`](../../package.json). Now browser
specific dependencies aren't mixed in with the non-browser specific dependencies in the root.

To do this we use the built-in `npm` [`workspace`](https://docs.npmjs.com/cli/v7/using-npm/workspaces) functionality, which allows us to create linked packages within the same project.
Now, an `npm install` will install all dependencies from the root `package.json` as well as all
dependencies from the workspace `package.json`s in a single go.

To interact with a workspace (a specific `package.json`) you would use the same `npm` command but add in the flag `--workspace browser` to target the [browser `package.json`](./package.json). Eg: `npm install fs --workspace browser`.

[Another example with the LSP.](https://github.com/aws/aws-toolkit-common/blob/147df8f44f08e081675e01cebf9f957ca9658add/lsp/core/aws-lsp-yaml-common/package.json#L10)

### Adding new browser specific dependencies

While in the project root, run `npm install {MODULE} --workspace browser`, where
`browser` is the tail end of the workspace name `src/browser`.
