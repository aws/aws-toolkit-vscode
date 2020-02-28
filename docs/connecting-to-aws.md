# Connecting to AWS from the AWS Toolkit for Visual Studio Code

For full details on how to connect to AWS from the **AWS Toolkit for Visual Studio Code (VS Code)**, see the [user guide](https://docs.aws.amazon.com/console/toolkit-for-vscode/welcome), specifically the topics about [setting up your AWS credentials](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/setup-credentials.html) and [connecting to AWS](https://docs.aws.amazon.com/console/toolkit-for-vscode/connect).

The **AWS Toolkit for VS Code** uses the same shared credentials files as the [AWS Command Line Interface](https://aws.amazon.com/cli/) (AWS CLI). Read more about these files in the [Configuration and Credential Files](https://docs.aws.amazon.com/cli/latest/userguide/cli-config-files.html) topic of the _AWS Command Line Interface User Guide_. While the shared credentials files are common between the AWS CLI and this Toolkit, there are some profiles that are supported by the AWS CLI that are not compatible with the Toolkit.

## User Flow

From the VS Code [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) (**View**, then **Command Palette**), type "AWS" and then select **AWS: Connect to AWS**. The credentials available for use by the Toolkit are shown, starting with those most recently used. If no credentials were found by the Toolkit, users are provided with an optional guide to setting up a basic Shared Credentials profile.

Instead of selecting Credentials from the list, users have the option to create a new Shared Credentials Profie (see "Adding Credentials" below).

If credentials are selected from the list, they are validated by the Toolkit. If valid, the Toolkit uses them to connect to AWS.

Once the Toolkit connects to AWS, and the **AWS Explorer** shows resources (such as AWS Lambda functions) from the associated account. The credentials used by the Toolkit are shown in the VS Code status bar.

## Supported Credentials

The following types of credentials are supported:

-   Credential profiles defined in shared [credentials files](https://docs.aws.amazon.com/cli/latest/userguide/cli-config-files.html):
    -   Profiles with an access key and a secret key ([Named Profiles](https://docs.aws.amazon.com/cli/latest/userguide/cli-multiple-profiles.html))
    -   Profiles that [assume a role](https://docs.aws.amazon.com/cli/latest/userguide/cli-roles.html)
    -   Profiles that [assume a role and use multifactor authentication](https://docs.aws.amazon.com/cli/latest/userguide/cli-roles.html#cli-configure-role-mfa) (MFA)
        -   When connecting with credentials defined to assume a role and use MFA, the Toolkit prompts for an MFA token.
    -   profiles that use an [external credential process](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/external-credential-process.html)

## Adding Credentials

Additional credentials can be defined in the shared AWS credentials file. In the VS Code Command Palette, select **AWS: Create Credentials Profile**. The Toolkit does the following:

-   If the shared AWS credentials file is not found, the Toolkit prompts for a profile name, an access key ID, and the corresponding secret access key. This information is then used to create an initial credentials file.
-   If the shared AWS credentials file is found, it is opened in VS Code for editing, and the Toolkit provides information about how to change the file.

## Working with Regions in other Partitions

Partitions influence which regions are available for an account to operate in. Many popular regions belong to the "aws" partition, such as "us-east-1" (N. Virginia). Some regions such as "cn-north-1" (Beijing) reside in [other partitions](https://docs.aws.amazon.com/general/latest/gr/rande.html#learn-more).

Toolkit support for regions in other partitions is dependent on the type of credentials being used, as outlined below. Portions of the Toolkit's features may not be available in every partition.

### Partition support using Shared Credentials Profiles

If a profile contains a `region` key, its value will be used to determine the partition used by these credentials. When `region` is not found, the profile is assumed to have the region `us-east-1`.
