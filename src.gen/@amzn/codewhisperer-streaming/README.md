<!-- generated file, do not edit directly -->

# @amzn/codewhisperer-streaming

## Description

AWS SDK for JavaScript CodeWhispererStreaming Client for Node.js, Browser and React Native.

## Installing

To install the this package, simply type add or install @amzn/codewhisperer-streaming
using your favorite package manager:

-   `npm install @amzn/codewhisperer-streaming`
-   `yarn add @amzn/codewhisperer-streaming`
-   `pnpm add @amzn/codewhisperer-streaming`

## Getting Started

### Import

The AWS SDK is modulized by clients and commands.
To send a request, you only need to import the `CodeWhispererStreamingClient` and
the commands you need, for example `GetCodeGenerationInteractionResultCommand`:

```js
// ES5 example
const {
    CodeWhispererStreamingClient,
    GetCodeGenerationInteractionResultCommand,
} = require('@amzn/codewhisperer-streaming')
```

```ts
// ES6+ example
import { CodeWhispererStreamingClient, GetCodeGenerationInteractionResultCommand } from '@amzn/codewhisperer-streaming'
```

### Usage

To send a request, you:

-   Initiate client with configuration (e.g. credentials, region).
-   Initiate command with input parameters.
-   Call `send` operation on client with command object as input.
-   If you are using a custom http handler, you may call `destroy()` to close open connections.

```js
// a client can be shared by different commands.
const client = new CodeWhispererStreamingClient({ region: 'REGION' })

const params = {
    /** input parameters */
}
const command = new GetCodeGenerationInteractionResultCommand(params)
```

#### Async/await

We recommend using [await](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await)
operator to wait for the promise returned by send operation as follows:

```js
// async/await.
try {
    const data = await client.send(command)
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
    data => {
        // process data.
    },
    error => {
        // error handling.
    }
)
```

Promises can also be called using `.catch()` and `.finally()` as follows:

```js
client
    .send(command)
    .then(data => {
        // process data.
    })
    .catch(error => {
        // error handling.
    })
    .finally(() => {
        // finally.
    })
```

#### Callbacks

We do not recommend using callbacks because of [callback hell](http://callbackhell.com/),
but they are supported by the send operation.

```js
// callbacks.
client.send(command, (err, data) => {
    // process err and data.
})
```

#### v2 compatible style

The client can also send requests using v2 compatible style.
However, it results in a bigger bundle size and may be dropped in next major version. More details in the blog post
on [modular packages in AWS SDK for JavaScript](https://aws.amazon.com/blogs/developer/modular-packages-in-aws-sdk-for-javascript/)

```ts
import * as AWS from '@amzn/codewhisperer-streaming'
const client = new AWS.CodeWhispererStreaming({ region: 'REGION' })

// async/await.
try {
    const data = await client.getCodeGenerationInteractionResult(params)
    // process data.
} catch (error) {
    // error handling.
}

// Promises.
client
    .getCodeGenerationInteractionResult(params)
    .then(data => {
        // process data.
    })
    .catch(error => {
        // error handling.
    })

// callbacks.
client.getCodeGenerationInteractionResult(params, (err, data) => {
    // process err and data.
})
```

### Troubleshooting

When the service returns an exception, the error will include the exception information,
as well as response metadata (e.g. request id).

```js
try {
    const data = await client.send(command)
    // process data.
} catch (error) {
    const { requestId, cfId, extendedRequestId } = error.$$metadata
    console.log({ requestId, cfId, extendedRequestId })
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

-   Visit [Developer Guide](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/welcome.html)
    or [API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/index.html).
-   Check out the blog posts tagged with [`aws-sdk-js`](https://aws.amazon.com/blogs/developer/tag/aws-sdk-js/)
    on AWS Developer Blog.
-   Ask a question on [StackOverflow](https://stackoverflow.com/questions/tagged/aws-sdk-js) and tag it with `aws-sdk-js`.
-   Join the AWS JavaScript community on [gitter](https://gitter.im/aws/aws-sdk-js-v3).
-   If it turns out that you may have found a bug, please [open an issue](https://github.com/aws/aws-sdk-js-v3/issues/new/choose).

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
AssociateCustomizationPermission
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/associatecustomizationpermissioncommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/associatecustomizationpermissioncommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/associatecustomizationpermissioncommandoutput.html)

</details>
<details>
<summary>
CreateCustomization
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/createcustomizationcommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/createcustomizationcommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/createcustomizationcommandoutput.html)

</details>
<details>
<summary>
CreateProfile
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/createprofilecommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/createprofilecommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/createprofilecommandoutput.html)

</details>
<details>
<summary>
DeleteCustomization
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/deletecustomizationcommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/deletecustomizationcommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/deletecustomizationcommandoutput.html)

</details>
<details>
<summary>
DeleteProfile
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/deleteprofilecommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/deleteprofilecommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/deleteprofilecommandoutput.html)

</details>
<details>
<summary>
DisassociateCustomizationPermission
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/disassociatecustomizationpermissioncommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/disassociatecustomizationpermissioncommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/disassociatecustomizationpermissioncommandoutput.html)

</details>
<details>
<summary>
GenerateRecommendations
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/generaterecommendationscommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/generaterecommendationscommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/generaterecommendationscommandoutput.html)

</details>
<details>
<summary>
GetCustomization
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/getcustomizationcommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/getcustomizationcommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/getcustomizationcommandoutput.html)

</details>
<details>
<summary>
ListCustomizationPermissions
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/listcustomizationpermissionscommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/listcustomizationpermissionscommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/listcustomizationpermissionscommandoutput.html)

</details>
<details>
<summary>
ListCustomizations
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/listcustomizationscommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/listcustomizationscommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/listcustomizationscommandoutput.html)

</details>
<details>
<summary>
ListProfiles
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/listprofilescommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/listprofilescommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/listprofilescommandoutput.html)

</details>
<details>
<summary>
ListTagsForResource
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/listtagsforresourcecommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/listtagsforresourcecommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/listtagsforresourcecommandoutput.html)

</details>
<details>
<summary>
TagResource
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/tagresourcecommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/tagresourcecommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/tagresourcecommandoutput.html)

</details>
<details>
<summary>
UntagResource
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/untagresourcecommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/untagresourcecommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/untagresourcecommandoutput.html)

</details>
<details>
<summary>
UpdateCustomization
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/updatecustomizationcommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/updatecustomizationcommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/updatecustomizationcommandoutput.html)

</details>
<details>
<summary>
UpdateProfile
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/updateprofilecommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/updateprofilecommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/updateprofilecommandoutput.html)

</details>
<details>
<summary>
BootstrapConversation
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/bootstrapconversationcommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/bootstrapconversationcommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/bootstrapconversationcommandoutput.html)

</details>
<details>
<summary>
CreateArtifactUploadUrl
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/createartifactuploadurlcommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/createartifactuploadurlcommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/createartifactuploadurlcommandoutput.html)

</details>
<details>
<summary>
CreateUploadUrl
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/createuploadurlcommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/createuploadurlcommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/createuploadurlcommandoutput.html)

</details>
<details>
<summary>
GenerateCompletions
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/generatecompletionscommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/generatecompletionscommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/generatecompletionscommandoutput.html)

</details>
<details>
<summary>
GetCodeAnalysis
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/getcodeanalysiscommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/getcodeanalysiscommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/getcodeanalysiscommandoutput.html)

</details>
<details>
<summary>
GetCodeGenerationInteraction
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/getcodegenerationinteractioncommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/getcodegenerationinteractioncommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/getcodegenerationinteractioncommandoutput.html)

</details>
<details>
<summary>
GetCodeMigration
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/getcodemigrationcommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/getcodemigrationcommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/getcodemigrationcommandoutput.html)

</details>
<details>
<summary>
GetCodeMigrationPlan
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/getcodemigrationplancommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/getcodemigrationplancommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/getcodemigrationplancommandoutput.html)

</details>
<details>
<summary>
ListAvailableCustomizations
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/listavailablecustomizationscommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/listavailablecustomizationscommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/listavailablecustomizationscommandoutput.html)

</details>
<details>
<summary>
ListCodeAnalysisFindings
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/listcodeanalysisfindingscommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/listcodeanalysisfindingscommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/listcodeanalysisfindingscommandoutput.html)

</details>
<details>
<summary>
SendTelemetryEvent
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/sendtelemetryeventcommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/sendtelemetryeventcommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/sendtelemetryeventcommandoutput.html)

</details>
<details>
<summary>
StartCodeAnalysis
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/startcodeanalysiscommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/startcodeanalysiscommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/startcodeanalysiscommandoutput.html)

</details>
<details>
<summary>
StartCodeGenerationInteraction
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/startcodegenerationinteractioncommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/startcodegenerationinteractioncommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/startcodegenerationinteractioncommandoutput.html)

</details>
<details>
<summary>
StartCodeMigration
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/startcodemigrationcommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/startcodemigrationcommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/startcodemigrationcommandoutput.html)

</details>
<details>
<summary>
Chat
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/chatcommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/chatcommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/chatcommandoutput.html)

</details>
<details>
<summary>
ExecutePlanningInteraction
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/executeplanninginteractioncommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/executeplanninginteractioncommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/executeplanninginteractioncommandoutput.html)

</details>
<details>
<summary>
GetCodeGenerationInteractionResult
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/getcodegenerationinteractionresultcommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/getcodegenerationinteractionresultcommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/getcodegenerationinteractionresultcommandoutput.html)

</details>
<details>
<summary>
StartConversation
</summary>

[Command API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/classes/startconversationcommand.html) / [Input](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/startconversationcommandinput.html) / [Output](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-codewhispererstreaming/interfaces/startconversationcommandoutput.html)

</details>
