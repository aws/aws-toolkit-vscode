/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { VscodeRemoteSshConfig } from '../shared/extensions/ssh'
import { Result } from '../shared/utilities/result'

export class Ec2RemoteSshConfig extends VscodeRemoteSshConfig {
    private readonly command: string =
        "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p'"
    protected override proxyCommandRegExp = new RegExp(`/proxycommand.{0,1024}${this.command}.{0,99}/i`)

    public override async ensureValid() {
        const proxyCommand = await this.getProxyCommand(this.command)
        if (proxyCommand.isErr()) {
            return proxyCommand
        }

        const verifyHost = await this.verifySSHHost(proxyCommand.unwrap())
        if (verifyHost.isErr()) {
            return verifyHost
        }

        return Result.ok()
    }

    protected override createSSHConfigSection(proxyCommand: string): string {
        return `
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host i-* mi-*
    User ${this.hostNamePrefix}
    ProxyCommand sh -c \"${this.command}\"
`
    }
}
