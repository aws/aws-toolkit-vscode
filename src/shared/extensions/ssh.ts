/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as nls from 'vscode-nls'
import { getLogger } from '../logger'
import { ChildProcess } from '../utilities/childProcess'
import { SystemUtilities } from '../systemUtilities'

const localize = nls.loadMessageBundle()

export const SSH_AGENT_SOCKET_VARIABLE = 'SSH_AUTH_SOCK'

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
