<!-- generated file, do not edit directly -->

# @amzn/codewhisperer-streaming

## Description

AWS SDK for JavaScript CodeWhispererStreaming Client for Node.js, Browser and React Native.

## Installing
To install this package, simply type add or install @amzn/codewhisperer-streaming
using your favorite package manager:
- `npm install @amzn/codewhisperer-streaming`
- `yarn add @amzn/codewhisperer-streaming`
- `pnpm add @amzn/codewhisperer-streaming`

## Getting Started

### Import

The AWS SDK is modulized by clients and commands.
To send a request, you only need to import the `CodeWhispererStreamingClient` and
the commands you need, for example `SendMessageCommand`:

```js
// ES5 example
const { CodeWhispererStreamingClient, SendMessageCommand } = require("@amzn/codewhisperer-streaming");
```

```ts
// ES6+ example
import { CodeWhispererStreamingClient, SendMessageCommand } from "@amzn/codewhisperer-streaming";
```

### Usage

To send a request, you:

- Initiate client with configuration (e.g. credentials, region).
- Initiate command with input parameters.
- Call `send` operation on client with command object as input.
- If you are using a custom http handler, you may call `destroy()` to close open connections.

```js
// a client can be shared by different commands.
const client = new CodeWhispererStreamingClient({ region: "REGION" });

const params = { /** input parameters */ };
const command = new SendMessageCommand(params);
```

#### Async/await

We recommend using [await](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await)
operator to wait for the promise returned by send operation as follows:

```js
// async/await.
try {
  const data = await client.send(command);
  // process data.
} catch (error) {
  // error handling.
} finally {
  // finally.
}
```

Async-await is clean, concise, intuitive, easy to debug and has better error handling
as compared to using Promise chains or callbacks.

#### Promises

You can also use [Promise chaining](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises#chaining)
to execute send operation.

```js
client.send(command).then(
  (data) => {
    // process data.
  },
  (error) => {
    // error handling.
  }
);
```

Promises can also be called using `.catch()` and `.finally()` as follows:

```js
client
  .send(command)
  .then((data) => {
    // process data.
  })
  .catch((error) => {
    // error handling.
  })
  .finally(() => {
    // finally.
  });
```

#### Callbacks

We do not recommend using callbacks because of [callback hell](http://callbackhell.com/),
but they are supported by the send operation.

```js
// callbacks.
client.send(command, (err, data) => {
  // process err and data.
});
```

#### v2 compatible style

The client can also send requests using v2 compatible style.
However, it results in a bigger bundle size and may be dropped in next major version. More details in the blog post
on [modular packages in AWS SDK for JavaScript](https://aws.amazon.com/blogs/developer/modular-packages-in-aws-sdk-for-javascript/)

```ts
import * as AWS from "@amzn/codewhisperer-streaming";
const client = new AWS.CodeWhispererStreaming({ region: "REGION" });

// async/await.
try {
  const data = await client.sendMessage(params);
  // process data.
} catch (error) {
  // error handling.
}

// Promises.
client
  .sendMessage(params)
  .then((data) => {
    // process data.
  })
  .catch((error) => {
    // error handling.
  });

// callbacks.
client.sendMessage(params, (err, data) => {
  // process err and data.
});
```

### Troubleshooting

When the service returns an exception, the error will include the exception information,
as well as response metadata (e.g. request id).

```js
try {
  const data = await client.send(command);
  // process data.
} catch (error) {
  const { requestId, cfId, extendedRequestId } = error.$metadata;
  console.log({ requestId, cfId, extendedRequestId });
  /**
   * The keys within exceptions are also parsed.
   * You can access them by specifying exception names:
   * if (error.name === 'SomeServiceException') {
   *     const value = error.specialKeyInException;
   * }
   */
}
```

## Getting Help

Please use these community resources for getting help.
We use the GitHub issues for tracking bugs and feature requests, but have limited bandwidth to address them.

- Visit [Developer Guide](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/welcome.html)
  or [API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/index.html).
- Check out the blog posts tagged with [`aws-sdk-js`](https://aws.amazon.com/blogs/developer/tag/aws-sdk-js/)
  on AWS Developer Blog.
- Ask a question on [StackOverflow](https://stackoverflow.com/questions/tagged/aws-sdk-js) and tag it with `aws-sdk-js`.
- Join the AWS JavaScript community on [gitter](https://gitter.im/aws/aws-sdk-js-v3).
- If it turns out that you may have found a bug, please [open an issue](https://github.com/aws/aws-sdk-js-v3/issues/new/choose).

To test your universal JavaScript code in Node.js, browser and react-native environments,
visit our [code samples repo](https://github.com/aws-samples/aws-sdk-js-tests).

## Contributing

This client code is generated automatically. Any modifications will be overwritten the next time the `@amzn/codewhisperer-streaming` package is updated.
To contribute to client you can check our [generate clients scripts](https://github.com/aws/aws-sdk-js-v3/tree/main/scripts/generate-clients).

## License

This SDK is distributed under the
[Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0),
see LICENSE for more information.

## Client Commands (Operations List)

<details>
<summary>
AllowVendedLogDeliveryForResource
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/AllowVendedLogDeliveryForResourceCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/AllowVendedLogDeliveryForResourceCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/AllowVendedLogDeliveryForResourceCommandOutput/)
</details>
<details>
<summary>
AssociateCustomizationPermission
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/AssociateCustomizationPermissionCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/AssociateCustomizationPermissionCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/AssociateCustomizationPermissionCommandOutput/)
</details>
<details>
<summary>
CreateCustomization
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/CreateCustomizationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateCustomizationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateCustomizationCommandOutput/)
</details>
<details>
<summary>
CreateProfile
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/CreateProfileCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateProfileCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateProfileCommandOutput/)
</details>
<details>
<summary>
CreateWorkspace
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/CreateWorkspaceCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateWorkspaceCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateWorkspaceCommandOutput/)
</details>
<details>
<summary>
DeleteCustomization
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/DeleteCustomizationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/DeleteCustomizationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/DeleteCustomizationCommandOutput/)
</details>
<details>
<summary>
DeleteProfile
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/DeleteProfileCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/DeleteProfileCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/DeleteProfileCommandOutput/)
</details>
<details>
<summary>
DisassociateCustomizationPermission
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/DisassociateCustomizationPermissionCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/DisassociateCustomizationPermissionCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/DisassociateCustomizationPermissionCommandOutput/)
</details>
<details>
<summary>
GenerateRecommendations
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GenerateRecommendationsCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GenerateRecommendationsCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GenerateRecommendationsCommandOutput/)
</details>
<details>
<summary>
GetCustomization
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GetCustomizationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetCustomizationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetCustomizationCommandOutput/)
</details>
<details>
<summary>
ListCustomizationPermissions
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListCustomizationPermissionsCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListCustomizationPermissionsCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListCustomizationPermissionsCommandOutput/)
</details>
<details>
<summary>
ListCustomizations
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListCustomizationsCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListCustomizationsCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListCustomizationsCommandOutput/)
</details>
<details>
<summary>
ListCustomizationVersions
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListCustomizationVersionsCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListCustomizationVersionsCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListCustomizationVersionsCommandOutput/)
</details>
<details>
<summary>
ListProfiles
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListProfilesCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListProfilesCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListProfilesCommandOutput/)
</details>
<details>
<summary>
ListTagsForResource
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListTagsForResourceCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListTagsForResourceCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListTagsForResourceCommandOutput/)
</details>
<details>
<summary>
ListWorkspaceMetadata
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListWorkspaceMetadataCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListWorkspaceMetadataCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListWorkspaceMetadataCommandOutput/)
</details>
<details>
<summary>
TagResource
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/TagResourceCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/TagResourceCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/TagResourceCommandOutput/)
</details>
<details>
<summary>
UntagResource
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/UntagResourceCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/UntagResourceCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/UntagResourceCommandOutput/)
</details>
<details>
<summary>
UpdateCustomization
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/UpdateCustomizationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/UpdateCustomizationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/UpdateCustomizationCommandOutput/)
</details>
<details>
<summary>
UpdateProfile
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/UpdateProfileCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/UpdateProfileCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/UpdateProfileCommandOutput/)
</details>
<details>
<summary>
VendKeyGrant
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/VendKeyGrantCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/VendKeyGrantCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/VendKeyGrantCommandOutput/)
</details>
<details>
<summary>
CreateArtifactUploadUrl
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/CreateArtifactUploadUrlCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateArtifactUploadUrlCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateArtifactUploadUrlCommandOutput/)
</details>
<details>
<summary>
CreateTaskAssistConversation
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/CreateTaskAssistConversationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateTaskAssistConversationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateTaskAssistConversationCommandOutput/)
</details>
<details>
<summary>
CreateUploadUrl
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/CreateUploadUrlCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateUploadUrlCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateUploadUrlCommandOutput/)
</details>
<details>
<summary>
DeleteTaskAssistConversation
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/DeleteTaskAssistConversationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/DeleteTaskAssistConversationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/DeleteTaskAssistConversationCommandOutput/)
</details>
<details>
<summary>
GenerateCompletions
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GenerateCompletionsCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GenerateCompletionsCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GenerateCompletionsCommandOutput/)
</details>
<details>
<summary>
GetCodeAnalysis
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GetCodeAnalysisCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetCodeAnalysisCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetCodeAnalysisCommandOutput/)
</details>
<details>
<summary>
GetCodeFixJob
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GetCodeFixJobCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetCodeFixJobCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetCodeFixJobCommandOutput/)
</details>
<details>
<summary>
GetTaskAssistCodeGeneration
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GetTaskAssistCodeGenerationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetTaskAssistCodeGenerationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetTaskAssistCodeGenerationCommandOutput/)
</details>
<details>
<summary>
GetTestGeneration
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GetTestGenerationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetTestGenerationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetTestGenerationCommandOutput/)
</details>
<details>
<summary>
GetTransformation
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GetTransformationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetTransformationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetTransformationCommandOutput/)
</details>
<details>
<summary>
GetTransformationPlan
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GetTransformationPlanCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetTransformationPlanCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetTransformationPlanCommandOutput/)
</details>
<details>
<summary>
ListAvailableCustomizations
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListAvailableCustomizationsCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListAvailableCustomizationsCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListAvailableCustomizationsCommandOutput/)
</details>
<details>
<summary>
ListAvailableProfiles
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListAvailableProfilesCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListAvailableProfilesCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListAvailableProfilesCommandOutput/)
</details>
<details>
<summary>
ListCodeAnalysisFindings
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListCodeAnalysisFindingsCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListCodeAnalysisFindingsCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListCodeAnalysisFindingsCommandOutput/)
</details>
<details>
<summary>
ListFeatureEvaluations
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListFeatureEvaluationsCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListFeatureEvaluationsCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListFeatureEvaluationsCommandOutput/)
</details>
<details>
<summary>
ResumeTransformation
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ResumeTransformationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ResumeTransformationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ResumeTransformationCommandOutput/)
</details>
<details>
<summary>
SendTelemetryEvent
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/SendTelemetryEventCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/SendTelemetryEventCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/SendTelemetryEventCommandOutput/)
</details>
<details>
<summary>
StartCodeAnalysis
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/StartCodeAnalysisCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartCodeAnalysisCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartCodeAnalysisCommandOutput/)
</details>
<details>
<summary>
StartCodeFixJob
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/StartCodeFixJobCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartCodeFixJobCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartCodeFixJobCommandOutput/)
</details>
<details>
<summary>
StartTaskAssistCodeGeneration
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/StartTaskAssistCodeGenerationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartTaskAssistCodeGenerationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartTaskAssistCodeGenerationCommandOutput/)
</details>
<details>
<summary>
StartTestGeneration
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/StartTestGenerationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartTestGenerationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartTestGenerationCommandOutput/)
</details>
<details>
<summary>
StartTransformation
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/StartTransformationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartTransformationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartTransformationCommandOutput/)
</details>
<details>
<summary>
StopTransformation
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/StopTransformationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StopTransformationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StopTransformationCommandOutput/)
</details>
<details>
<summary>
ExportResultArchive
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ExportResultArchiveCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ExportResultArchiveCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ExportResultArchiveCommandOutput/)
</details>
<details>
<summary>
GenerateAssistantResponse
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GenerateAssistantResponseCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GenerateAssistantResponseCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GenerateAssistantResponseCommandOutput/)
</details>
<details>
<summary>
GenerateTaskAssistPlan
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GenerateTaskAssistPlanCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GenerateTaskAssistPlanCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GenerateTaskAssistPlanCommandOutput/)
</details>
<details>
<summary>
AssociateConnectorResource
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/AssociateConnectorResourceCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/AssociateConnectorResourceCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/AssociateConnectorResourceCommandOutput/)
</details>
<details>
<summary>
CreateAssignment
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/CreateAssignmentCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateAssignmentCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateAssignmentCommandOutput/)
</details>
<details>
<summary>
CreateExtension
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/CreateExtensionCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateExtensionCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateExtensionCommandOutput/)
</details>
<details>
<summary>
CreatePlugin
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/CreatePluginCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreatePluginCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreatePluginCommandOutput/)
</details>
<details>
<summary>
CreateResolution
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/CreateResolutionCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateResolutionCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/CreateResolutionCommandOutput/)
</details>
<details>
<summary>
DeleteAssignment
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/DeleteAssignmentCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/DeleteAssignmentCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/DeleteAssignmentCommandOutput/)
</details>
<details>
<summary>
DeleteExtension
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/DeleteExtensionCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/DeleteExtensionCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/DeleteExtensionCommandOutput/)
</details>
<details>
<summary>
DeletePlugin
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/DeletePluginCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/DeletePluginCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/DeletePluginCommandOutput/)
</details>
<details>
<summary>
GetConnector
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GetConnectorCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetConnectorCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetConnectorCommandOutput/)
</details>
<details>
<summary>
GetConversation
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GetConversationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetConversationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetConversationCommandOutput/)
</details>
<details>
<summary>
GetExtension
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GetExtensionCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetExtensionCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetExtensionCommandOutput/)
</details>
<details>
<summary>
GetIdentityMetadata
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GetIdentityMetadataCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetIdentityMetadataCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetIdentityMetadataCommandOutput/)
</details>
<details>
<summary>
GetPlugin
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GetPluginCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetPluginCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetPluginCommandOutput/)
</details>
<details>
<summary>
GetTask
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GetTaskCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetTaskCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetTaskCommandOutput/)
</details>
<details>
<summary>
GetTroubleshootingResults
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GetTroubleshootingResultsCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetTroubleshootingResultsCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GetTroubleshootingResultsCommandOutput/)
</details>
<details>
<summary>
InvokeTask
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/InvokeTaskCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/InvokeTaskCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/InvokeTaskCommandOutput/)
</details>
<details>
<summary>
ListConversations
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListConversationsCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListConversationsCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListConversationsCommandOutput/)
</details>
<details>
<summary>
ListDashboardMetrics
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListDashboardMetricsCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListDashboardMetricsCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListDashboardMetricsCommandOutput/)
</details>
<details>
<summary>
ListExtensionProviders
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListExtensionProvidersCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListExtensionProvidersCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListExtensionProvidersCommandOutput/)
</details>
<details>
<summary>
ListExtensions
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListExtensionsCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListExtensionsCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListExtensionsCommandOutput/)
</details>
<details>
<summary>
ListPluginProviders
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListPluginProvidersCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListPluginProvidersCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListPluginProvidersCommandOutput/)
</details>
<details>
<summary>
ListPlugins
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListPluginsCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListPluginsCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListPluginsCommandOutput/)
</details>
<details>
<summary>
ListTagsForResource
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListTagsForResourceCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListTagsForResourceCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListTagsForResourceCommandOutput/)
</details>
<details>
<summary>
ListTasks
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/ListTasksCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListTasksCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/ListTasksCommandOutput/)
</details>
<details>
<summary>
PassRequest
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/PassRequestCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/PassRequestCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/PassRequestCommandOutput/)
</details>
<details>
<summary>
RejectConnector
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/RejectConnectorCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/RejectConnectorCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/RejectConnectorCommandOutput/)
</details>
<details>
<summary>
SendEvent
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/SendEventCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/SendEventCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/SendEventCommandOutput/)
</details>
<details>
<summary>
SendMessage
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/SendMessageCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/SendMessageCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/SendMessageCommandOutput/)
</details>
<details>
<summary>
StartConversation
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/StartConversationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartConversationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartConversationCommandOutput/)
</details>
<details>
<summary>
StartTroubleshootingAnalysis
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/StartTroubleshootingAnalysisCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartTroubleshootingAnalysisCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartTroubleshootingAnalysisCommandOutput/)
</details>
<details>
<summary>
StartTroubleshootingResolutionExplanation
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/StartTroubleshootingResolutionExplanationCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartTroubleshootingResolutionExplanationCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/StartTroubleshootingResolutionExplanationCommandOutput/)
</details>
<details>
<summary>
TagResource
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/TagResourceCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/TagResourceCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/TagResourceCommandOutput/)
</details>
<details>
<summary>
UntagResource
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/UntagResourceCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/UntagResourceCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/UntagResourceCommandOutput/)
</details>
<details>
<summary>
UpdateTroubleshootingCommandResult
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/UpdateTroubleshootingCommandResultCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/UpdateTroubleshootingCommandResultCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/UpdateTroubleshootingCommandResultCommandOutput/)
</details>
<details>
<summary>
UsePlugin
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/UsePluginCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/UsePluginCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/UsePluginCommandOutput/)
</details>
<details>
<summary>
GenerateCodeFromCommands
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/GenerateCodeFromCommandsCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GenerateCodeFromCommandsCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/GenerateCodeFromCommandsCommandOutput/)
</details>
<details>
<summary>
SendMessage
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/codewhispererstreaming/command/SendMessageCommand/) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/SendMessageCommandInput/) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-codewhispererstreaming/Interface/SendMessageCommandOutput/)
</details>
