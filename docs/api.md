# AWS Toolkit API

Details about any publicly accessible functionalities exposed through [extension commands](https://code.visualstudio.com/api/references/vscode-api#commands) or [exported APIs](https://code.visualstudio.com/api/references/vscode-api#extensions).

## Pseudo (Internal-only) API

### Commands

#### `aws.codeWhisperer.connect`

**Signature**: _async (startUrl?: string, region?: string, customizationArn?: string, customizationNamePrefix?: string) => Promise<void>_

Shortcut command to directly connect to Identity Center or prompt start URL entry, as well as set a customization for CodeWhisperer requests.

This command supports the following arguments:

-   startUrl and region. If both arguments are provided they will be used, otherwise the command prompts for them interactively.
-   customizationArn: select customization by ARN. If provided, `customizationNamePrefix` is ignored.
-   customizationNamePrefix: select customization by prefix, if `customizationArn` is `undefined`.

### Extension API

#### `listSsoConnections`

**Signature**: _async () => Promise<AwsToolkitSsoConnection>_

This is an API that exposes the metadata of SSO connections of AWS Toolkit. It returns a list of `AwsToolkitSsoConnection` which contains below fields:

-   id: string that presents the id of the connection
-   label: label of the connection
-   type: type of the connection, can only be 'sso'
-   ssoRegion: region of the connection, e.g: us-west-2
-   startUrl: start url of the connection
-   scopes?: list of the scopes of the connection
