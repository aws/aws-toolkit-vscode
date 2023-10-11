# AWS Toolkit API

Details about any publicly accessible functionalities exposed through [extension commands](https://code.visualstudio.com/api/references/vscode-api#commands) or [exported APIs](https://code.visualstudio.com/api/references/vscode-api#extensions).

## Pseudo (Internal-only) API

### Commands

#### `aws.codeWhisperer.connect`

**Signature**: _async (startUrl?: string, region?: string) => Promise<void>_

Shortcut command to directly connect to Identity Center or prompt start URL entry, as well as set a customization for CodeWhisperer requests. Customization is not yet supported.

This command expects two arguments: startUrl and region (both strings).
If these arguments are provided, they will be used. Otherwise, the commands prompts for them interactively.
