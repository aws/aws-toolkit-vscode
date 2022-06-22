/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as nls from 'vscode-nls'
import * as fs from 'fs-extra'
import { readFileAsString } from '../shared/filesystemUtilities'
import { HOST_NAME_PREFIX } from './constants'
import { SystemUtilities } from '../shared/systemUtilities'
import { ChildProcess } from '../shared/utilities/childProcess'
import { getIdeProperties } from '../shared/extensionUtilities'
import { showConfirmationMessage } from '../shared/utilities/messages'
import { getLogger } from '../shared/logger/logger'
import globals from '../shared/extensionGlobals'
import { ToolkitError } from '../shared/toolkitError'

const localize = nls.loadMessageBundle()

type EnsureMdeSSHConfigError =
    | ''
    | 'bash not found'
    | 'failed to copy mde_connect'
    | 'old config'
    | 'ssh failed'
    | 'user canceled'
    | 'write failed'

interface EnsureMdeSSHConfig {
    ok: boolean
    err: EnsureMdeSSHConfigError
    msg: string
}

export const SSH_AGENT_SOCKET_VARIABLE = 'SSH_AUTH_SOCK'
const configHostName = `${HOST_NAME_PREFIX}*`

/**
 * Checks if the "aws-mde-*" SSH config hostname pattern is working, else prompts user to add it.
 *
 * @returns Result object indicating whether the SSH config is working, or failure reason.
 */
export async function ensureMdeSshConfig(sshPath: string): Promise<EnsureMdeSSHConfig> {
    const iswin = process.platform === 'win32'

    const bash = await SystemUtilities.findBashPath()
    if (!bash && !iswin) {
        return {
            ok: false,
            err: 'bash not found',
            msg: localize('AWS.mde.error.noBash', 'Cannot find required tool: bash'),
        }
    }

    const mdeScript = await getMdeScript()
    if (isMdeSSHConfigurationError(mdeScript)) {
        return mdeScript
    }
    const proxyCommand = getProxyCommand(iswin, mdeScript)
    const mdeSshConfig = createSSHConfig(proxyCommand)

    const verifyHost = await verifySSHHost({ sshPath, mdeScript, proxyCommand, mdeSshConfig })
    if (isMdeSSHConfigurationError(verifyHost)) {
        return verifyHost
    }

    return { ok: true, err: '', msg: '' }
}

async function getMdeScript(): Promise<string | EnsureMdeSSHConfig> {
    let mdeScript: string
    try {
        mdeScript = await ensureConnectScript()
    } catch (e) {
        if (e instanceof ToolkitError) {
            return {
                ok: false,
                err: 'failed to copy mde_connect',
                msg: e.message,
            }
        }
        throw e
    }
    return mdeScript
}

function createSSHConfig(proxyCommand: string): string {
    // "AddKeysToAgent" will automatically add keys used on the server to the local agent. If not set, then `ssh-add`
    // must be done locally. It's mostly a convenience thing; private keys are _not_ shared with the server.

    const mdeSshConfig = `
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host ${configHostName}
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand ${proxyCommand}
`
    return mdeSshConfig
}

export async function ensureConnectScript(context = globals.context): Promise<string> {
    const scriptName = `mde_connect${process.platform === 'win32' ? '.ps1' : ''}`

    // Script resource path. Includes the Toolkit version string so it changes with each release.
    const mdeScriptRes = context.asAbsolutePath(path.join('resources', scriptName))

    // Copy to globalStorage to ensure a "stable" path (not influenced by Toolkit version string.)
    const mdeScript = path.join(context.globalStoragePath, scriptName)

    try {
        const contents1 = await readFileAsString(mdeScriptRes)
        let contents2 = ''
        if (fs.existsSync(mdeScript)) {
            contents2 = await readFileAsString(mdeScript)
        }
        const isOutdated = contents1 !== contents2
        if (isOutdated) {
            fs.copyFileSync(mdeScriptRes, mdeScript)
        }
        getLogger().info('ensureMdeSshConfig: updated mde_connect script: %O', mdeScript)

        return mdeScript
    } catch (e) {
        getLogger().error('ensureMdeSshConfig: failed to write mde_connect script: %O\n%O', mdeScript, e)
        throw new ToolkitError(localize('AWS.mde.error.copyScript', 'Failed to update script: {0}', mdeScript))
    }
}

export function getSshConfigPath(): string {
    const sshConfigDir = path.join(SystemUtilities.getHomeDirectory(), '.ssh')
    return path.join(sshConfigDir, 'config')
}

// Check if the "aws-mde-*" hostname pattern is working.
async function verifySSHHost({
    sshPath,
    mdeScript,
    proxyCommand,
    mdeSshConfig,
}: {
    sshPath: string
    mdeScript: string
    proxyCommand: string
    mdeSshConfig: string
}): Promise<EnsureMdeSSHConfig | void> {
    const matches = await sshHostMatches(sshPath, `${HOST_NAME_PREFIX}test`, mdeScript)
    if (isMdeSSHConfigurationError(matches)) {
        return {
            ok: false,
            err: 'ssh failed',
            msg: localize('AWS.mde.error.sshFail', 'ssh failed: {0}', mdeScript),
        }
    }
    const hasMdeProxyCommand = matches && matches[0].includes(proxyCommand)
    if (!hasMdeProxyCommand) {
        if (matches && matches[0]) {
            getLogger().warn(`MDE: SSH config: found old/outdated "${configHostName}" section:\n%O`, matches[0])
            const oldConfig = localize(
                'AWS.mde.error.oldConfig',
                'Your ~/.ssh/config has a {0} section that might be out of date. Delete it, then try again.',
                configHostName
            )
            return { ok: false, err: 'old config', msg: oldConfig }
        }

        const confirmTitle = localize(
            'AWS.mde.confirm.installSshConfig.title',
            '{0} Toolkit will add host {1} to ~/.ssh/config. This allows you to use SSH with your {0} MDE environments.',
            getIdeProperties().company,
            configHostName
        )
        const confirmText = localize('AWS.mde.confirm.installSshConfig.button', 'Update SSH config')
        const response = await showConfirmationMessage({ prompt: confirmTitle, confirm: confirmText })
        if (!response) {
            return { ok: false, err: 'user canceled', msg: '' }
        }

        const sshConfigPath = getSshConfigPath()
        try {
            fs.mkdirpSync(path.dirname(sshConfigPath))
            fs.appendFileSync(sshConfigPath, mdeSshConfig)
        } catch (e) {
            getLogger().error('ensureMdeSshConfig: failed to write: %O: %s', sshConfigPath, (e as Error).message ?? '')

            return {
                ok: false,
                err: 'write failed',
                msg: localize(
                    'AWS.mde.error.writeFail',
                    'Failed to write SSH config: {0} (permission issue?)',
                    sshConfigPath
                ),
            }
        }
    }
}

async function sshHostMatches(
    sshPath: string,
    sshName: string,
    mdeScript: string
): Promise<RegExpMatchArray | null | EnsureMdeSSHConfig> {
    const proc = new ChildProcess(sshPath, ['-G', sshName])
    const r = await proc.run()
    if (r.exitCode !== 0) {
        return {
            ok: false,
            err: 'ssh failed',
            msg: localize('AWS.mde.error.sshFail', 'ssh failed: {0}', mdeScript),
        }
    }
    const matches = r.stdout.match(/proxycommand.{0,1024}mde_connect(.ps1)?.{0,99}/i)
    return matches
}

function getProxyCommand(iswin: boolean, mdeScript: string) {
    return iswin ? `powershell.exe -ExecutionPolicy Bypass -File "${mdeScript}" %h` : `'${mdeScript}' '%h'`
}

function isMdeSSHConfigurationError(object: any): object is EnsureMdeSSHConfig {
    return (
        // eslint-disable-next-line no-null/no-null
        object !== null &&
        object !== undefined &&
        typeof object === 'object' &&
        'ok' in object &&
        'err' in object &&
        'msg' in object &&
        Object.keys(object).length === 3
    )
}

/**
 * Only mac has the agent running by default, other OS we need to start manually
 *
 * @returns `undefined` if agent is already running or on Windows, otherwise the SSH agent socket
 */
export async function startSshAgent(): Promise<string | undefined> {
    if (process.env[SSH_AGENT_SOCKET_VARIABLE] !== undefined) {
        return process.env[SSH_AGENT_SOCKET_VARIABLE]
    }

    getLogger().info('Starting SSH agent...')

    try {
        if (process.platform === 'win32') {
            const runningMessage = 'Already running'
            // First check if it's running
            // if not, try to start it
            // if that fails, try to set the start-up type to automatic
            // if that fails, then no agent
            const script = `
$info = Get-Service ssh-agent
if ($info.Status -eq "Running") { 
    echo "${runningMessage}"
    exit 0 
}
Start-Service ssh-agent
if (!$?) {
    Get-Service -Name ssh-agent | Set-Service -StartupType Manual
    if ($?) { Start-Service ssh-agent }
}
exit !$?
`
            const options = {
                rejectOnErrorCode: true,
                logging: 'noparams',
            } as const
            const result = await new ChildProcess('powershell.exe', ['-Command', script], options).run({
                onStdout: text => getLogger().verbose(`mde (ssh-agent): ${text}`),
                onStderr: text => getLogger().verbose(`mde (ssh-agent): ${text}`),
            })

            if (!result.stdout.includes(runningMessage) && !result.stderr) {
                vscode.window.showInformationMessage(
                    localize('AWS.mde.ssh-agent.start', 'The SSH agent has been started.')
                )
            }

            return
        }

        // TODO: this command outputs a shell command that you're supposed to execute, for now
        // we'll just parse the socket out and inject it into the ssh command
        const r = await new ChildProcess('ssh-agent', ['-s']).run()
        return (r.stdout.match(/$SSH_AGENT_VAR=(.*?);/) ?? [])[1]
    } catch (err) {
        // The 'silent' failure here is not great, though the SSH agent is not necessarily a critical
        // feature. It would be better to inform the user that the SSH agent could not be started, then
        // go from there. Many users probably wouldn't care about the agent at all.
        getLogger().warn('mde: failed to start SSH agent, clones may not work as expected: %O', err)
    }
}
