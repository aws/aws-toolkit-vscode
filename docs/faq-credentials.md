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
