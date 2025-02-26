## Language Server Debugging

1. Clone https://github.com/aws/language-servers.git and set it up in the same workspace as this project

    e.g.

    ```
    /aws-toolkit-vscode
    /toolkit
    /core
    /amazonq
    /language-servers
    ```

2. Inside of the language-servers project run:
    ```
    npm install
    npm run compile
    npm run package
    ```
    to get the project setup
3. Uncomment the `AWS_LANGUAGE_SERVER_OVERRIDE` variable in `amazonq/.vscode/launch.json` Extension configuration
4. Use the `Launch LSP with Debugging` configuration and set breakpoints in VSCode or the language server

## Amazon Q Inline Activation

-   In order to get inline completion working you must open a supported file type defined in CodewhispererInlineCompletionLanguages in `packages/amazonq/src/app/inline/completion.ts` before breakpoints can be hit in the language server
