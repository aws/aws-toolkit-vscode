/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as nls from 'vscode-nls'
import fs from '../fs/fs'
import { getLogger } from '../logger'
import { ChildProcess, ChildProcessResult } from '../utilities/processUtils'
import { ArrayConstructor, NonNullObject } from '../utilities/typeConstructors'
import { Settings } from '../settings'
import { VSCODE_EXTENSION_ID } from '../extensions'
import { SSM } from 'aws-sdk'
import { ErrorInformation, ToolkitError } from '../errors'

const localize = nls.loadMessageBundle()

export const sshAgentSocketVariable = 'SSH_AUTH_SOCK'

export class SshError extends ToolkitError {
    constructor(message: string, options: ErrorInformation) {
        super(message, {
            ...options,
            code: SshError.name,
        })
    }
}

export function getSshConfigPath(): string {
    const sshConfigDir = path.join(fs.getUserHomeDir(), '.ssh')
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
                onStdout: (text) => getLogger().verbose(`ssh (ssh-agent): ${text}`),
                onStderr: (text) => getLogger().verbose(`ssh (ssh-agent): ${text}`),
            })

            if (!result.stdout.includes(runningMessage) && !result.stderr) {
                void vscode.window.showInformationMessage(
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
            this._log(`updating remote SSH "defaultExtensions" setting with "${extensionId}"`)

            return this.update('defaultExtensions', [...current, extensionId])
        }

        return true
    }

    public async setRemotePlatform(hostname: string, platform: 'linux' | 'windows' | 'macOS'): Promise<boolean> {
        try {
            const current = this._getOrThrow('remotePlatform', {})
            current[hostname] = platform
            this._log(`updated remote SSH host "${hostname}" with platform "${platform}"`)

            return this.update('remotePlatform', current)
        } catch (error) {
            this._log(`failed to read "remotePlatform", no updates will be made`)

            return false
        }
    }
}

export async function testSshConnection(
    ProcessClass: typeof ChildProcess,
    hostname: string,
    sshPath: string,
    user: string,
    session: SSM.StartSessionResponse
): Promise<ChildProcessResult | never> {
    try {
        const env = { SESSION_ID: session.SessionId, STREAM_URL: session.StreamUrl, TOKEN: session.TokenValue }
        const result = await new ProcessClass(sshPath, [
            '-T',
            `${user}@${hostname}`,
            'echo "test connection succeeded" && exit',
        ]).run({
            spawnOptions: {
                env,
            },
        })
        return result
    } catch (error) {
        throw new SshError('SSH connection test failed', { cause: error as Error })
    }
}

export async function startVscodeRemote(
    ProcessClass: typeof ChildProcess,
    hostname: string,
    targetDirectory: string,
    vscPath: string,
    user?: string
): Promise<void> {
    const userAt = user ? `${user}@` : ''
    const workspaceUri = `vscode-remote://ssh-remote+${userAt}${hostname}${targetDirectory}`

    const settings = new RemoteSshSettings()
    settings.ensureDefaultExtension(VSCODE_EXTENSION_ID.awstoolkit).catch((e) => {
        // Non-fatal. Some users intentionally have readonly settings.
        getLogger().warn('startVscodeRemote: failed to set "defaultExtensions": %s', (e as Error).message)
    })

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
