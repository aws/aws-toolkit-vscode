# Architecture: design and implementation of product features

> How the main end-user features are designed and where (in code) they are implemented.
> Corresponds to the "Logical view" of the [4+1 architectural views](https://en.wikipedia.org/wiki/4%2B1_architectural_view_model).

## Explorer

TODO

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

### Implementation of remote connect

These modules show how to use and extend the "remote connect" functionality:

-   [shared/remoteSession.ts](/packages/core/src/shared/remoteSession.ts)
-   CodeCatalyst: [openDevEnv()](https://github.com/aws/aws-toolkit-vscode/blob/c77fc076fd0ed837d077bc0318716b711a2854c8/packages/core/src/codecatalyst/model.ts#L252)
-   EC2: [openSessionInTerminal()](https://github.com/aws/aws-toolkit-vscode/blob/c77fc076fd0ed837d077bc0318716b711a2854c8/packages/core/src/ec2/model.ts#L147)
-   ECS: [openTaskInTerminal()](https://github.com/aws/aws-toolkit-vscode/blob/c77fc076fd0ed837d077bc0318716b711a2854c8/packages/core/src/ecs/commands.ts#L133)
