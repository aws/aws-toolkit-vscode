# Connecting to AWS from the AWS Toolkit for Visual Studio Code

AWS Toolkit for Visual Studio Code uses the same credentials files as the [AWS Command Line Interface](https://aws.amazon.com/cli/). Read more about these files on [Configuration and Credential Files](https://docs.aws.amazon.com/cli/latest/userguide/cli-config-files.html). AWS Command Line Interface is not required in order to use AWS Toolkit for Visual Studio Code.

## User Flow

From the VS Code [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette), select **AWS: Connect to AWS**. Credentials are shown, starting with those most recently used.

Select a credential from the list, or define a new one (see "Adding Credentials" below). The Toolkit describes how to define credentials if none are found.

The Toolkit connects to AWS, and the AWS Explorer shows resources (such as Lambda Functions) accessible by those credentials. The VS Code status bar displays which credentials the Toolkit is using.

## Supported Credentials

The following credentials are supported:

* Credential profiles defined in the credentials files (see [Configuration and Credential Files](https://docs.aws.amazon.com/cli/latest/userguide/cli-config-files.html))
  * Profiles with an access key and a secret key ([Named Profiles](https://docs.aws.amazon.com/cli/latest/userguide/cli-multiple-profiles.html))
  * Profiles that [assume a role](https://docs.aws.amazon.com/cli/latest/userguide/cli-roles.html)
  * Profiles that [assume a role](https://docs.aws.amazon.com/cli/latest/userguide/cli-roles.html) and [use multifactor authentication](https://docs.aws.amazon.com/cli/latest/userguide/cli-roles.html#cli-roles-mfa) (MFA)
    * The Toolkit prompts for an MFA token when connecting with credentials defined to assume a role and use MFA

## Adding Credentials

Additional credentials can be defined in the credentials files. The "Create a credential profile" button in the Toolkit does the following:

* if no credentials file is found, prompts for an access key/secret key pair, which is then used to create an initial credentials file
* if a credentials file is found, it is opened in VS Code for editing, and the Toolkit provides information about how to change the file
