/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import { Result } from '../shared/utilities/result'
import { fileExists, readFileAsString } from '../shared/filesystemUtilities'
import { ToolkitError } from '../shared/errors'
import { getLogger } from '../shared/logger'
import { VscodeRemoteSshConfig } from '../shared/extensions/ssh'

export async function ensureConnectScript(context = globals.context): Promise<Result<vscode.Uri, ToolkitError>> {
    const scriptName = `codecatalyst_connect${process.platform === 'win32' ? '.ps1' : ''}`

    // Script resource path. Includes the Toolkit version string so it changes with each release.
    const versionedScript = vscode.Uri.joinPath(context.extensionUri, 'resources', scriptName)

    // Copy to globalStorage to ensure a "stable" path (not influenced by Toolkit version string.)
    const connectScript = vscode.Uri.joinPath(context.globalStorageUri, scriptName)

    try {
        const exists = await fileExists(connectScript.fsPath)
        const contents1 = await readFileAsString(versionedScript.fsPath)
        const contents2 = exists ? await readFileAsString(connectScript.fsPath) : ''
        const isOutdated = contents1 !== contents2

        if (isOutdated) {
            await fs.copyFile(versionedScript.fsPath, connectScript.fsPath)
            getLogger().info('ssh: updated connect script')
        }

        return Result.ok(connectScript)
    } catch (e) {
        const message = localize('AWS.codecatalyst.error.copyScript', 'Failed to update connect script')

        return Result.err(ToolkitError.chain(e, message, { code: 'ConnectScriptUpdateFailed' }))
    }
}

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

        const section = this.createSSHConfigSection(proxyCommand.unwrap())

        const verifyHost = await this.verifySSHHost({ proxyCommand: proxyCommand.unwrap(), section })
        if (verifyHost.isErr()) {
            return verifyHost
        }

        return Result.ok()
    }

    public createSSHConfigSection(proxyCommand: string): string {
        // "AddKeysToAgent" will automatically add keys used on the server to the local agent. If not set, then `ssh-add`
        // must be done locally. It's mostly a convenience thing; private keys are _not_ shared with the server.

        return `
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host ${this.configHostName}
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand ${proxyCommand}
    `
    }
}
