/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Result } from '../shared/utilities/result'
import { VscodeRemoteSshConfig, ensureConnectScript } from '../shared/sshConfig'

export class CodeCatalystSshConfig extends VscodeRemoteSshConfig {
    protected override readonly proxyCommandRegExp: RegExp = /proxycommand.{0,1024}codecatalyst_connect(.ps1)?.{0,99}/i
    /**
     * Checks if the "aws-devenv-*" SSH config hostname pattern is working, else prompts user to add it.
     *
     * @returns Result object indicating whether the SSH config is working, or failure reason.
     */
    public override async ensureValid() {
        const scriptResult = await ensureConnectScript()
        if (scriptResult.isErr()) {
            return scriptResult
        }

        const connectScript = scriptResult.ok()
        const proxyCommand = await this.getProxyCommand(connectScript.fsPath)
        if (proxyCommand.isErr()) {
            return proxyCommand
        }

        const verifyHost = await this.verifySSHHost(proxyCommand.unwrap())
        if (verifyHost.isErr()) {
            return verifyHost
        }

        return Result.ok()
    }
}
