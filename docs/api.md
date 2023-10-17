# AWS Toolkit API

Details about any publicly accessible functionalities exposed through [extension commands](https://code.visualstudio.com/api/references/vscode-api#commands) or [exported APIs](https://code.visualstudio.com/api/references/vscode-api#extensions).

## Pseudo (Internal-only) API

### Commands

#### `aws.codeWhisperer.connect`

**Signature**: _async (startUrl?: string, region?: string, customizationArn?: string, customizationName?: string, customizationDescription?: string) => Promise<void>_

Shortcut command to directly connect to Identity Center or prompt start URL entry, as well as set a customization for CodeWhisperer requests.

This command supports two sets of arguments:

-   startUrl and region. If both arguments are provided they will be used, otherwise the command prompts for them interactively.
-   customization{Arn, Name, Description}. If at least customizationArn is provided, the command selects this customization.
