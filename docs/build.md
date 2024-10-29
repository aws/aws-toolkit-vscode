# Build

The AmazonQ features rely on the `codewhisperer-streaming` service, who's client
is generated from the service's smithy models and placed in
`src.gen/@amzn/codewhisperer-streaming` (For more
information about this client and how it is generated, please see this
[quip document](https://quip-amazon.com/2dAWAvTIYXXr/Build-instructions-for-AWS-CodeWhisperer-Streaming-Typescript-client)).

This client is a standalone npm project in typescript, and it is added to
the project as a workspace in the project's root `package.json` with the line `"workspaces": [ ..., "src.gen/@amzn/codewhisperer-streaming" ]`.
The client may be manually built using `npm run build -w @amzn/codewhisperer-streaming"`.
The `generateClients` run script ensures that this dependency is
built before the toolkit project itself. Workspaces are automatically ready to
be imported in the root toolkit project by their declared package.json name,
(`@amzn/codewhisperer-streaming` in this case).
