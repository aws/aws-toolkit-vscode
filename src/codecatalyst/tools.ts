/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import * as path from 'path'
import { getOrInstallCli } from '../shared/utilities/cliUtils'
import { Result } from '../shared/utilities/result'
import { isExtensionInstalled, showInstallExtensionMsg } from '../shared/utilities/vsCodeUtils'
import { SystemUtilities } from '../shared/systemUtilities'
import { pushIf } from '../shared/utilities/collectionUtils'
import { ChildProcess } from '../shared/utilities/childProcess'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { fileExists, readFileAsString } from '../shared/filesystemUtilities'
import { ToolkitError, UnknownError } from '../shared/errors'
import { getLogger } from '../shared/logger'
import { getIdeProperties } from '../shared/extensionUtilities'
import { showConfirmationMessage } from '../shared/utilities/messages'
import { getSshConfigPath } from '../shared/extensions/ssh'

interface DependencyPaths {
    readonly vsc: string
    readonly ssm: string
    readonly ssh: string
}

interface MissingTool {
    readonly name: 'code' | 'ssm' | 'ssh'
    readonly reason?: string
}

export const hostNamePrefix = 'aws-devenv-'

export async function ensureDependencies(
    window = vscode.window
): Promise<Result<DependencyPaths, CancellationError | Error>> {
    if (!isExtensionInstalled('ms-vscode-remote.remote-ssh')) {
        showInstallExtensionMsg('ms-vscode-remote.remote-ssh', 'Remote SSH', 'Connecting to Dev Environment', window)

        return Result.err(
            new ToolkitError('Remote SSH extension not installed', {
                cancelled: true,
                code: 'MissingExtension',
            })
        )
    }

    const tools = await ensureTools()
    if (tools.isErr()) {
        const missing = tools
            .err()
            .map(d => d.name)
            .join(', ')
        const msg = localize(
            'AWS.codecatalyst.missingRequiredTool',
            'Failed to connect to Dev Environment, missing required tools: {0}',
            missing
        )

        tools.err().forEach(d => {
            if (d.reason) {
                getLogger().error(`codecatalyst: failed to get tool "${d.name}": ${d.reason}`)
            }
        })

        return Result.err(
            new ToolkitError(msg, {
                code: 'MissingTools',
                details: { missing },
            })
        )
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

async function ensureTools() {
    const [vsc, ssh, ssm] = await Promise.all([
        SystemUtilities.getVscodeCliPath(),
        SystemUtilities.findSshPath(),
        ensureSsmCli(),
    ])

    const missing: MissingTool[] = []
    pushIf(missing, vsc === undefined, { name: 'code' })
    pushIf(missing, ssh === undefined, { name: 'ssh' })

    if (ssm.isErr()) {
        missing.push({ name: 'ssm', reason: ssm.err() })
    }

    if (vsc === undefined || ssh === undefined || ssm.isErr()) {
        return Result.err(missing)
    }

    return Result.ok({ vsc, ssh, ssm: ssm.ok() })
}

/**
 * Checks if the SSM plugin CLI `session-manager-plugin` is available and
 * working, else prompts user to install it.
 *
 * @returns Result object indicating whether the SSH config is working, or failure reason.
 */
async function ensureSsmCli() {
    const r = await Result.promise(getOrInstallCli('session-manager-plugin', false))

    return r.mapErr(e => UnknownError.cast(e).message)
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
            '{0} Toolkit will add host {1} to ~/.ssh/config. This allows you to use SSH with your development envionments',
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
            await fs.mkdirp(path.dirname(sshConfigPath))
            await fs.appendFile(sshConfigPath, section)
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
