/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as nls from 'vscode-nls'
import * as fs from 'fs-extra'
import { getLogger } from '../logger'
import { ChildProcess, ChildProcessResult } from '../utilities/childProcess'
import { SystemUtilities } from '../systemUtilities'
import { ArrayConstructor, NonNullObject } from '../utilities/typeConstructors'
import { Settings } from '../settings'
import { VSCODE_EXTENSION_ID } from '../extensions'
import { Err, Ok, Result } from '../utilities/result'
import { ToolkitError } from '../errors'
import { getIdeProperties } from '../extensionUtilities'
import { showConfirmationMessage } from '../utilities/messages'
import { CancellationError } from '../utilities/timeoutUtils'

const localize = nls.loadMessageBundle()

export const sshAgentSocketVariable = 'SSH_AUTH_SOCK'

export function getSshConfigPath(): string {
    const sshConfigDir = path.join(SystemUtilities.getHomeDirectory(), '.ssh')
    return path.join(sshConfigDir, 'config')
}

/**
 * Only mac has the agent running by default, other OS we need to start manually
 *
 * @returns `undefined` if agent is already running or on Windows, otherwise the SSH agent socket
 */
export async function startSshAgent(): Promise<string | undefined> {
    if (process.env[sshAgentSocketVariable] !== undefined) {
        return process.env[sshAgentSocketVariable]
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
                onStdout: text => getLogger().verbose(`ssh (ssh-agent): ${text}`),
                onStderr: text => getLogger().verbose(`ssh (ssh-agent): ${text}`),
            })

            if (!result.stdout.includes(runningMessage) && !result.stderr) {
                vscode.window.showInformationMessage(
                    localize('AWS.ssh.ssh-agent.start', 'The SSH agent has been started.')
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
        getLogger().warn('ssh: failed to start SSH agent, clones may not work as expected: %O', err)
    }
}

const remoteSshTypes = {
    path: String,
    defaultExtensions: ArrayConstructor(String),
    remotePlatform: NonNullObject,
    useLocalServer: Boolean,
}

export class RemoteSshSettings extends Settings.define('remote.SSH', remoteSshTypes) {
    public async ensureDefaultExtension(extensionId: string): Promise<boolean> {
        const current = this.get('defaultExtensions', [])

        if (!current.includes(extensionId)) {
            this.log(`updating remote SSH "defaultExtensions" setting with "${extensionId}"`)

            return this.update('defaultExtensions', [...current, extensionId])
        }

        return true
    }

    public async setRemotePlatform(hostname: string, platform: 'linux' | 'windows' | 'macOS'): Promise<boolean> {
        try {
            const current = this.getOrThrow('remotePlatform', {})
            current[hostname] = platform
            this.log(`updated remote SSH host "${hostname}" with platform "${platform}"`)

            return this.update('remotePlatform', current)
        } catch (error) {
            this.log(`failed to read "remotePlatform", no updates will be made`)

            return false
        }
    }
}

export async function startVscodeRemote(
    ProcessClass: typeof ChildProcess,
    hostname: string,
    targetDirectory: string,
    vscPath: string
): Promise<void> {
    const workspaceUri = `vscode-remote://ssh-remote+${hostname}${targetDirectory}`

    const settings = new RemoteSshSettings()
    settings.ensureDefaultExtension(VSCODE_EXTENSION_ID.awstoolkit)

    if (process.platform === 'win32') {
        await Promise.all([
            // TODO(sijaden): we should periodically clean this setting up, maybe
            // by removing all hostnames that use the `aws-` prefix
            await settings.setRemotePlatform(hostname, 'linux'),

            // TODO(sijaden): revert this setting back to normal after the user connects
            await settings.update('useLocalServer', false),
        ])
    }

    await new ProcessClass(vscPath, ['--folder-uri', workspaceUri]).run()
}

export abstract class VscodeRemoteSshConfig {
    protected readonly configHostName: string
    protected abstract proxyCommandRegExp: RegExp

    public constructor(protected readonly sshPath: string, protected readonly hostNamePrefix: string) {
        this.configHostName = `${hostNamePrefix}*`
    }

    protected isWin(): boolean {
        return process.platform === 'win32'
    }

    protected async getProxyCommand(command: string): Promise<Result<string, ToolkitError>> {
        if (this.isWin()) {
            // Some older versions of OpenSSH (7.8 and below) have a bug where attempting to use powershell.exe directly will fail without an absolute path
            const proc = new ChildProcess('powershell.exe', ['-Command', '(get-command powershell.exe).Path'])
            const r = await proc.run()
            if (r.exitCode !== 0) {
                return Result.err(new ToolkitError('Failed to get absolute path for powershell', { cause: r.error }))
            }
            return Result.ok(`"${r.stdout}" -ExecutionPolicy RemoteSigned -File "${command}" %h`)
        } else {
            return Result.ok(`'${command}' '%h'`)
        }
    }

    public abstract ensureValid(): Promise<Err<Error> | Err<ToolkitError> | Ok<void>>

    protected abstract createSSHConfigSection(proxyCommand: string): string

    protected async checkSshOnHost(): Promise<ChildProcessResult> {
        const proc = new ChildProcess(this.sshPath, ['-G', `${this.hostNamePrefix}test`])
        const result = await proc.run()
        return result
    }

    protected async matchSshSection() {
        const result = await this.checkSshOnHost()
        if (result.exitCode !== 0) {
            return Result.err(result.error ?? new Error(`ssh check against host failed: ${result.exitCode}`))
        }
        const matches = result.stdout.match(this.proxyCommandRegExp)
        return Result.ok(matches?.[0])
    }

    private async promptUserForOutdatedSection(configSection: string): Promise<void> {
        getLogger().warn(
            `codecatalyst: SSH config: found old/outdated "${this.configHostName}" section:\n%O`,
            configSection
        )
        const oldConfig = localize(
            'AWS.codecatalyst.error.oldConfig',
            'Your ~/.ssh/config has a {0} section that might be out of date. Delete it, then try again.',
            this.configHostName
        )

        const openConfig = localize('AWS.ssh.openConfig', 'Open config...')
        vscode.window.showWarningMessage(oldConfig, openConfig).then(resp => {
            if (resp === openConfig) {
                vscode.window.showTextDocument(vscode.Uri.file(getSshConfigPath()))
            }
        })

        throw new ToolkitError(oldConfig, { code: 'OldConfig' })
    }

    private async writeSectionToConfig(proxyCommand: string) {
        const sshConfigPath = getSshConfigPath()
        const section = this.createSSHConfigSection(proxyCommand)
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

            throw ToolkitError.chain(e, message, { code: 'ConfigWriteFailed' })
        }
    }

    protected async promptUserToConfigureSshConfig(
        configSection: string | undefined,
        proxyCommand: string
    ): Promise<void> {
        if (configSection !== undefined) {
            await this.promptUserForOutdatedSection(configSection)
        }

        const confirmTitle = localize(
            'AWS.codecatalyst.confirm.installSshConfig.title',
            '{0} Toolkit will add host {1} to ~/.ssh/config to use SSH with your Dev Environments',
            getIdeProperties().company,
            this.configHostName
        )
        const confirmText = localize('AWS.codecatalyst.confirm.installSshConfig.button', 'Update SSH config')
        const response = await showConfirmationMessage({ prompt: confirmTitle, confirm: confirmText })
        if (!response) {
            throw new CancellationError('user')
        }

        await this.writeSectionToConfig(proxyCommand)
    }

    // Check if the hostname pattern is working.
    protected async verifySSHHost(proxyCommand: string) {
        const matchResult = await this.matchSshSection()
        if (matchResult.isErr()) {
            return matchResult
        }

        const configSection = matchResult.ok()
        const hasProxyCommand = configSection?.includes(proxyCommand)

        if (!hasProxyCommand) {
            try {
                await this.promptUserToConfigureSshConfig(configSection, proxyCommand)
            } catch (e) {
                return Result.err(e as Error)
            }
        }

        return Result.ok()
    }
}
