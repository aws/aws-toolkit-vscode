/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import * as path from 'path'
import { Result } from '../shared/utilities/result'
import { ChildProcess } from '../shared/utilities/childProcess'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { fileExists, readFileAsString } from '../shared/filesystemUtilities'
import { ToolkitError } from '../shared/errors'
import { getLogger } from '../shared/logger'
import { getIdeProperties } from '../shared/extensionUtilities'
import { showConfirmationMessage } from '../shared/utilities/messages'
import { getSshConfigPath } from '../shared/extensions/ssh'
import { ensureRemoteSshInstalled, ensureTools, handleMissingTool } from '../shared/remoteSession'

interface DependencyPaths {
    readonly vsc: string
    readonly ssm: string
    readonly ssh: string
}

export interface MissingTool {
    readonly name: 'code' | 'ssm' | 'ssh'
    readonly reason?: string
}

export const hostNamePrefix = 'aws-devenv-'

export async function ensureDependencies(): Promise<Result<DependencyPaths, CancellationError | Error>> {
    try {
        await ensureRemoteSshInstalled()
    } catch (e) {
        return Result.err(e as Error)
    }

    const tools = await ensureTools()
    if (tools.isErr()) {
        return await handleMissingTool(tools)
    }

    const config = await ensureCodeCatalystSshConfig(tools.ok().ssh)
    if (config.isErr()) {
        const err = config.err()
        getLogger().error(`codecatalyst: failed to add ssh config section: ${err.message}`)

        return Result.err(err)
    }

    return tools
}

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

/**
 * Checks if the "aws-devenv-*" SSH config hostname pattern is working, else prompts user to add it.
 *
 * @returns Result object indicating whether the SSH config is working, or failure reason.
 */
async function ensureCodeCatalystSshConfig(sshPath: string) {
    const iswin = process.platform === 'win32'

    const scriptResult = await ensureConnectScript()
    if (scriptResult.isErr()) {
        return scriptResult
    }

    const connectScript = scriptResult.ok()
    const proxyCommand = await getProxyCommand(iswin, connectScript.fsPath)
    if (proxyCommand.isErr()) {
        return proxyCommand
    }

    const section = createSSHConfigSection(proxyCommand.unwrap())

    const verifyHost = await verifySSHHost({ sshPath, proxyCommand: proxyCommand.unwrap(), section })
    if (verifyHost.isErr()) {
        return verifyHost
    }

    return Result.ok()
}

const configHostName = `${hostNamePrefix}*`
function createSSHConfigSection(proxyCommand: string): string {
    // "AddKeysToAgent" will automatically add keys used on the server to the local agent. If not set, then `ssh-add`
    // must be done locally. It's mostly a convenience thing; private keys are _not_ shared with the server.

    return `
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host ${configHostName}
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand ${proxyCommand}
`
}

// Check if the "aws-devenv-*" hostname pattern is working.
async function verifySSHHost({
    sshPath,
    section,
    proxyCommand,
}: {
    sshPath: string
    section: string
    proxyCommand: string
}) {
    const matchResult = await matchSshSection(sshPath, `${hostNamePrefix}test`)
    if (matchResult.isErr()) {
        return matchResult
    }

    const configSection = matchResult.ok()
    const hasProxyCommand = configSection?.includes(proxyCommand)

    if (!hasProxyCommand) {
        if (configSection !== undefined) {
            getLogger().warn(
                `codecatalyst: SSH config: found old/outdated "${configHostName}" section:\n%O`,
                configSection
            )
            const oldConfig = localize(
                'AWS.codecatalyst.error.oldConfig',
                'Your ~/.ssh/config has a {0} section that might be out of date. Delete it, then try again.',
                configHostName
            )

            const openConfig = localize('AWS.ssh.openConfig', 'Open config...')
            vscode.window.showWarningMessage(oldConfig, openConfig).then(resp => {
                if (resp === openConfig) {
                    vscode.window.showTextDocument(vscode.Uri.file(getSshConfigPath()))
                }
            })

            return Result.err(new ToolkitError(oldConfig, { code: 'OldConfig' }))
        }

        const confirmTitle = localize(
            'AWS.codecatalyst.confirm.installSshConfig.title',
            '{0} Toolkit will add host {1} to ~/.ssh/config to use SSH with your Dev Environments',
            getIdeProperties().company,
            configHostName
        )
        const confirmText = localize('AWS.codecatalyst.confirm.installSshConfig.button', 'Update SSH config')
        const response = await showConfirmationMessage({ prompt: confirmTitle, confirm: confirmText })
        if (!response) {
            return Result.err(new CancellationError('user'))
        }

        const sshConfigPath = getSshConfigPath()
        try {
            await fs.ensureDir(path.dirname(path.dirname(sshConfigPath)), { mode: 0o755 })
            await fs.ensureDir(path.dirname(sshConfigPath), 0o700)
            await fs.appendFile(sshConfigPath, section, { mode: 0o600 })
        } catch (e) {
            const message = localize(
                'AWS.codecatalyst.error.writeFail',
                'Failed to write SSH config: {0} (permission issue?)',
                sshConfigPath
            )

            return Result.err(ToolkitError.chain(e, message, { code: 'ConfigWriteFailed' }))
        }
    }

    return Result.ok()
}

async function matchSshSection(sshPath: string, sshName: string) {
    const proc = new ChildProcess(sshPath, ['-G', sshName])
    const r = await proc.run()
    if (r.exitCode !== 0) {
        return Result.err(r.error ?? new Error(`ssh check against host failed: ${r.exitCode}`))
    }

    const matches = r.stdout.match(/proxycommand.{0,1024}codecatalyst_connect(.ps1)?.{0,99}/i)
    return Result.ok(matches?.[0])
}

async function getProxyCommand(iswin: boolean, script: string): Promise<Result<string, ToolkitError>> {
    if (iswin) {
        // Some older versions of OpenSSH (7.8 and below) have a bug where attempting to use powershell.exe directly will fail without an absolute path
        const proc = new ChildProcess('powershell.exe', ['-Command', '(get-command powershell.exe).Path'])
        const r = await proc.run()
        if (r.exitCode !== 0) {
            return Result.err(new ToolkitError('Failed to get absolute path for powershell', { cause: r.error }))
        }
        return Result.ok(`"${r.stdout}" -ExecutionPolicy RemoteSigned -File "${script}" %h`)
    } else {
        return Result.ok(`'${script}' '%h'`)
    }
}
