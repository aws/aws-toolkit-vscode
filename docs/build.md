# Build

The AmazonQ features rely on the `codewhisperer-streaming` service, to support both Sigv4 and Bearer token modes of this service,
two clients are generated from the service's smithy models and placed in
`src.gen/@amzn/amazon-q-developer-streaming-client` and `src.gen/@amzn/codewhisperer-streaming` respectively (For more
information about these clients and how they are generated, please see this
[quip document](https://quip-amazon.com/2dAWAvTIYXXr/Build-instructions-for-AWS-CodeWhisperer-Streaming-Typescript-client)).

## @amzn/amazon-q-developer-streaming client

This client is a standalone npm project in typescript, and it is added to
the project as a workspace in the project's root `package.json` with the line `"workspaces": [ ..., "src.gen/@amzn/amazon-q-developer-streaming" ]`.
The client may be manually built using `npm run build -w @amzn/amazon-q-developer-streaming"`.
The `generateClients` run script ensures that this dependency is
built before the toolkit project itself. Workspaces are automatically ready to
be imported in the root toolkit project by their declared package.json name,
(`@amzn/amazon-q-developer-streaming` in this case).

## @amzn/codewhisperer-streaming client

This client is a standalone npm project in typescript, and it is added to
the project as a workspace in the project's root `package.json` with the line `"workspaces": [ ..., "src.gen/@amzn/codewhisperer-streaming" ]`.
The client may be manually built using `npm run build -w @amzn/codewhisperer-streaming"`.
The `generateClients` run script ensures that this dependency is
built before the toolkit project itself. Workspaces are automatically ready to
be imported in the root toolkit project by their declared package.json name,
(`@amzn/codewhisperer-streaming` in this case).
