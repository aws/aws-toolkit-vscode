# Connecting to AWS from the AWS Toolkit for Visual Studio Code

For full details on how to connect to AWS from the **AWS Toolkit for Visual Studio Code (VS Code)**, see the [user guide](https://docs.aws.amazon.com/console/toolkit-for-vscode/welcome), specifically the topics about [setting up your AWS credentials](https://docs.aws.amazon.com/console/toolkit-for-vscode/setup-credentials) and [connecting to AWS](https://docs.aws.amazon.com/console/toolkit-for-vscode/connect).

The **AWS Toolkit for VS Code** uses the same credentials files as the [AWS Command Line Interface](https://aws.amazon.com/cli/). Read more about these files in the [Configuration and Credential Files](https://docs.aws.amazon.com/cli/latest/userguide/cli-config-files.html) topic of the _AWS Command Line Interface User Guide_. Note that the AWS Command Line Interface is required only for certain features of the AWS Toolkit for VS Code.

## User Flow

From the VS Code [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) (**View**, then **Command Palette**), type "AWS" and then select **AWS: Connect to AWS**. Existing credential profiles are shown, starting with the most recently used.

Select a credential profile from the list or define a new one (see "Adding Credentials" below). The Toolkit describes how to define credentials if none are found.

The Toolkit connects to AWS, and the **AWS Explorer** shows the resources (such as AWS Lambda functions) that are accessible through the selected credentials. The VS Code status bar displays which credentials the Toolkit is using.

## Supported Credentials

The following types of credentials are supported:

* Credential profiles defined in the credentials files (see [Configuration and Credential Files](https://docs.aws.amazon.com/cli/latest/userguide/cli-config-files.html)):
  * Profiles with an access key and a secret key ([Named Profiles](https://docs.aws.amazon.com/cli/latest/userguide/cli-multiple-profiles.html))
  * Profiles that [assume a role](https://docs.aws.amazon.com/cli/latest/userguide/cli-roles.html)
  * Profiles that [assume a role](https://docs.aws.amazon.com/cli/latest/userguide/cli-roles.html) and [use multifactor authentication](https://docs.aws.amazon.com/cli/latest/userguide/cli-roles.html#cli-configure-role-mfa) (MFA)
    * When connecting with credentials defined to assume a role and use MFA, the Toolkit prompts for an MFA token.

## Adding Credentials

Additional credentials can be defined in the shared AWS credentials file. In the VS Code Command Palette, select **AWS: Create Credentials Profile**. The Toolkit does the following:

* If the shared AWS credentials file is not found, the Toolkit prompts for a profile name, an access key ID, and the corresponding secret access key. This information is then used to create an initial credentials file.
* If the shared AWS credentials file is found, it is opened in VS Code for editing, and the Toolkit provides information about how to change the file.
