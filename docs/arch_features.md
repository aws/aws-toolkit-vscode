# Architecture: design and implementation of product features

> How the main end-user features are designed and where (in code) they are implemented.
> Corresponds to the "Logical view" of the [4+1 architectural views](https://en.wikipedia.org/wiki/4%2B1_architectural_view_model).

## Explorer

The AWS Explorer interacts with AWS resources through a variety of mechanisms and functionalities.

### AWS Explorer UI activation

The `activate` function in `packages/core/src/awsexplorer/activation.ts` sets up the AWS Explorer UI and related functionality. It initializes the AWS Explorer, registers commands, and sets up event listeners to handle changes in AWS credentials and context.

### Tree data provider

The `AwsExplorer` class in `packages/core/src/awsexplorer/awsExplorer.ts` implements the `vscode.TreeDataProvider` interface, providing a hierarchical view of AWS resources. It manages the tree structure, handles node expansion and collapse, and updates the tree when changes occur.

### Region nodes

The `RegionNode` class in `packages/core/src/awsexplorer/regionNode.ts` represents an AWS region in the Explorer. It contains child nodes for various AWS services, such as Lambda, S3, and CloudFormation. These child nodes are created based on the available services in the region and the user's configuration.

### Service nodes

Each AWS service has its own node class, such as `LambdaNode`, `S3Node`, and `CloudFormationNode`. These nodes are responsible for fetching and displaying the resources for their respective services. For example, the `ApiGatewayNode` class in `packages/core/src/awsService/apigateway/explorer/apiGatewayNodes.ts` represents the API Gateway service and fetches the list of APIs in the region.

### Commands

The AWS Explorer registers various commands to interact with AWS resources. For example, the `copyUrlCommand` in `packages/core/src/awsService/apigateway/commands/copyUrl.ts` copies the URL of an API Gateway stage to the clipboard. These commands are registered in the `activate` function and can be triggered by user actions in the Explorer.

### Child node loader

The `ChildNodeLoader` class in `packages/core/src/awsexplorer/childNodeLoader.ts` handles loading paginated children for nodes with many resources. It ensures that the nodes are loaded incrementally, improving performance and user experience.

### Event listeners

The AWS Explorer listens for various events, such as changes in AWS credentials, region updates, and context changes. These events trigger updates to the Explorer, ensuring that the displayed resources are always up-to-date.

## Local debugging of SAM Lambdas

TODO

## Remote connect

Toolkit provides "remote connect" for CodeCatalyst, EC2, and ECS (terminal only). This means
customers can connect (1) a new VSCode instance and (2) a VSCode Terminal to remote machines in AWS
and CodeCatalyst.

### Design of remote connect

For connecting a new VSCode instance, remote connect works like this:

1. User chooses the machine they want to connect to (CodeCatalyst dev env, or EC2 machine)
1. Toolkit ensures that the [vscode remote-ssh extension](https://code.visualstudio.com/docs/remote/ssh) is installed.
1. Toolkit automatically downloads a private copy of `session-manager-plugin`, or uses its previous copy.
1. Toolkit ensures that the user's `~/.ssh/config` file contains a special host-name pattern.
    - The SSH config item defines a `ProxyCommand` that invokes a Toolkit-provided shell script [codecatalyst_connect](/packages/core/resources/codecatalyst_connect) or [ec2_connect](/packages/core/resources/ec2_connect).
1. Toolkit starts a SSM session using the service API.
1. Toolkit starts a new instance of VSCode with environment variables containing values needed to connect (SSM session id, etc).
1. VSCode invokes `ssh` which invokes the Toolkit-defined `ProxyCommand` mentioned above, which uses the environment variables to invoke `session-manager-plugin` to create an SSH connection.
1. VSCode's remote-ssh feature uses the SSH connection to provide remote VSCode session on the remote machine.

For connecting a new VSCode _terminal_, remote connect works like this:

1. User chooses the machine they want to connect to (CodeCatalyst dev env, EC2, or ECS machine)
1. Toolkit automatically downloads a private copy of `session-manager-plugin`, or uses its previous copy.
1. Toolkit starts a SSM session using the service API.
1. Toolkit [builds a session-manager-plugin command](https://github.com/aws/aws-toolkit-vscode/blob/c77fc076fd0ed837d077bc0318716b711a2854c8/packages/core/src/ecs/util.ts#L92-L104) and [passes it to a new VSCode Terminal](https://github.com/aws/aws-toolkit-vscode/blob/c77fc076fd0ed837d077bc0318716b711a2854c8/packages/core/src/ecs/commands.ts#L141-L147).
1. VSCode displays the terminal, so the user can enter shell commands on the remote machine.

For EC2 specifically, there are a few additional steps:

1. Remote window connections are only supported for EC2 instances running a linux based OS such as Amazon Linux or Ubuntu. However, the terminal option is supported by all OS, and will open a Powershell-based terminal for Windows instances.
1. If connecting to EC2 instance via remote window, the toolkit generates temporary SSH keys (30 second lifetime), with the public key sent to the remote instance.
    - Key type is ed25519 if supported, or RSA otherwise.
    - Lines in `.ssh/authorized_keys` marked with the comment `#AWSToolkitForVSCode` will be removed by AWS Toolkit.
    - Assumes `.sss/authorized_keys` can be found under `/home/ec2-user/` on Amazon Linux and `/home/ubuntu/` on Ubuntu.
1. If insufficient permissions are detected on the attached IAM role, toolkit will prompt to add an inline policy with the necessary actions.
1. If SSM sessions remain open after closing the window/terminal, the toolkit will terminate them on-shutdown, or when starting another session to the same instance.

### Implementation of remote connect

These modules show how to use and extend the "remote connect" functionality:

-   [shared/remoteSession.ts](/packages/core/src/shared/remoteSession.ts)
-   CodeCatalyst: [openDevEnv()](https://github.com/aws/aws-toolkit-vscode/blob/c77fc076fd0ed837d077bc0318716b711a2854c8/packages/core/src/codecatalyst/model.ts#L252)
-   EC2: [openSessionInTerminal()](https://github.com/aws/aws-toolkit-vscode/blob/c77fc076fd0ed837d077bc0318716b711a2854c8/packages/core/src/ec2/model.ts#L147)
-   ECS: [openTaskInTerminal()](https://github.com/aws/aws-toolkit-vscode/blob/c77fc076fd0ed837d077bc0318716b711a2854c8/packages/core/src/ecs/commands.ts#L133)
