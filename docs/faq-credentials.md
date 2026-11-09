# FAQ / Troubleshooting - Auth/SSO/Credentials

### AWS Builder ID "Invalid client provided"

During AWS Builder ID sign in, some users ran in to this error in the browser.
This is due to a stale state in `~/.aws/sso`.

Issue [aws-toolkit-vscode#3667](https://github.com/aws/aws-toolkit-vscode/issues/3667)

#### Solution

1. Rename the current folder: `mv ~/.aws/sso ~/.aws/sso-OLD`
2. Attempt to sign in again with AWS Builder ID
3. If sign is is successful you can remove the old folder: `rm -rf ~/.aws/sso-OLD`
    1. Or revert the change: `mv ~/.aws/sso-OLD ~/.aws/sso`

### AWS Shared Credentials File

When authenticating with IAM credentials, the profile name, access key, and secret key will be stored on disk at a default location of `~/.aws/credentials` on Linux and MacOS, and `%USERPROFILE%\.aws\credentials` on Windows machines. The toolkit also supports editting this file manually, with the format specified [here](https://docs.aws.amazon.com/sdkref/latest/guide/file-format.html#file-format-creds). The credentials files also supports [role assumption](https://docs.aws.amazon.com/sdkref/latest/guide/access-assume-role.html) and [MFA](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa.html). Note that this credentials file is shared between all local AWS development tools. For more information, see the full documentation [here](https://docs.aws.amazon.com/sdkref/latest/guide/file-format.html).
