/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as nls from 'vscode-nls'
import * as fs from 'fs-extra'
import { TagMap } from '../../types/clientmde'
import { Repository } from '../../types/git'
import { productName } from '../shared/constants'
import { GitExtension } from '../shared/extensions/git'
import * as mde from '../shared/clients/mdeClient'
import { getStringHash } from '../shared/utilities/textUtilities'
import { readFileAsString } from '../shared/filesystemUtilities'
import { VSCODE_MDE_TAGS } from './constants'
import { SystemUtilities } from '../shared/systemUtilities'
import { ChildProcess } from '../shared/utilities/childProcess'
import { getIdeProperties } from '../shared/extensionUtilities'
import { showConfirmationMessage, showViewLogsMessage } from '../shared/utilities/messages'
import { getLogger } from '../shared/logger/logger'
import { getOrInstallCli } from '../shared/utilities/cliUtils'
import { execFileSync } from 'child_process'
import globals from '../shared/extensionGlobals'

const localize = nls.loadMessageBundle()

type VSCODE_MDE_TAG_NAMES = keyof typeof VSCODE_MDE_TAGS

/**
 * Creates tags tied to friendly names for lookup on the VS Code side, like filtering.
 * e.g.
 * ```
 * { "repository" : "https://www.github.com/aws/aws-toolkit-vscode" , ... }
 * ```
 * @param repo Repository object from the Git API
 */
export async function createTagValuesFromRepo(
    repo: Pick<Repository, 'state'>,
    git: Pick<GitExtension, 'getConfig'> = GitExtension.instance
): Promise<Partial<{ [key in VSCODE_MDE_TAG_NAMES]: string }>> {
    const val: Partial<{ [key in VSCODE_MDE_TAG_NAMES]: string }> = {
        repository: repo.state.remotes[0]?.fetchUrl ?? '',
        repositoryBranch: repo.state.HEAD?.name ?? '',
        tool: productName,
    }
    const hash = await getEmailHash(git)
    if (hash) {
        val.email = hash
    }

    return val
}

/**
 * Creates a tag map with descriptive tag names for immediate write to MDE environment
 * e.g.
 * ```
 * { "aws:mde:repository" : "https://www.github.com/aws/aws-toolkit-vscode" , ... }
 * ```
 * @param repo Repository object from the Git API
 */
export async function createTagMapFromRepo(
    repo: Pick<Repository, 'state'>,
    git: Pick<GitExtension, 'getConfig'> = GitExtension.instance
): Promise<TagMap> {
    const tags = await createTagValuesFromRepo(repo, git)
    const final: TagMap = {}
    for (const tagName of Object.keys(tags) as VSCODE_MDE_TAG_NAMES[]) {
        final[VSCODE_MDE_TAGS[tagName]] = tags[tagName]!
    }

    return final
}

export async function getEmailHash(
    git: Pick<GitExtension, 'getConfig'> = GitExtension.instance
): Promise<string | undefined> {
    const email = (await git.getConfig())['user.email']
    if (email) {
        return getStringHash(email)
    }
}

// TODO: Get Cloud9 icons, don't return vscode.ThemeIcon?
//       add second parameter for theme color when VS Code minver is bumped, e.g. new vscode.ThemeColor('charts.green')
export function getStatusIcon(status: string): vscode.ThemeIcon {
    switch (status) {
        case 'RUNNING':
            return new vscode.ThemeIcon('pass')
        case 'STOPPED':
            return new vscode.ThemeIcon('stop-circle')
        case 'FAILED':
            return new vscode.ThemeIcon('error')
        case 'DELETING':
        case 'DELETED':
            return new vscode.ThemeIcon('trash')
        default:
            return new vscode.ThemeIcon('sync~spin')
    }
}

export function makeLabelsString(env: Pick<mde.MdeEnvironment, 'tags'>): string {
    const labels = getTagsAndLabels(env).labels

    return labels.sort((a, b) => a.localeCompare(b)).join(' | ')
}

export function getTagsAndLabels(env: Pick<mde.MdeEnvironment, 'tags'>): { tags: TagMap; labels: string[] } {
    const vals = { tags: {} as TagMap, labels: [] as string[] }
    if (env.tags) {
        for (const key of Object.keys(env.tags)) {
            const val = env.tags[key]
            if (val) {
                vals.tags[key] = val
            } else {
                vals.labels.push(key)
            }
        }
    }

    return vals
}

export const MDE_STATUS_PRIORITY = new Map<string, number>([
    ['PENDING', 1],
    ['RUNNING', 0],
    ['STARTING', 3],
    ['STOPPING', 4],
    ['STOPPED', 5],
    ['FAILED', 2],
    ['DELETING', 6],
    ['DELETED', 7],
])
/**
 * Checks if the "aws-mde-*" SSH config hostname pattern is working, else prompts user to add it.
 *
 * @returns Result object indicating whether the SSH config is working, or failure reason.
 */
export async function ensureMdeSshConfig(): Promise<{ ok: boolean; err: string }> {
    const iswin = process.platform === 'win32'

    const bash = await SystemUtilities.findBashPath()
    if (!bash && !iswin) {
        return { ok: false, err: 'bash not found' }
    }

    const scriptName = `mde_connect${iswin ? '.ps1' : ''}`
    // Script resource path. Includes the Toolkit version string so it changes with each release.
    const mdeScriptRes = globals.context.asAbsolutePath(path.join('resources', scriptName))
    // Copy to globalStorage to ensure a "stable" path (not influenced by Toolkit version string.)
    const mdeScript = path.join(globals.context.globalStoragePath, scriptName)
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
    } catch (e) {
        getLogger().error('ensureMdeSshConfig: failed to update: %O\n%O', mdeScript, e)
        return { ok: false, err: 'failed to copy mde_connect' }
    }

    const proxyCommand = iswin
        ? `powershell.exe -ExecutionPolicy Bypass -File "${mdeScript}" %h`
        : `"${bash}" -c "'${mdeScript}' %h"`

    const mdeSshConfig = `
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host aws-mde-*
    ForwardAgent yes
    ProxyCommand ${proxyCommand}"
`
    const ssh = await SystemUtilities.findSshPath()
    if (!ssh) {
        return { ok: false, err: 'ssh not found' }
    }
    // Check if the "aws-mde-*" hostname pattern is working.
    const proc = new ChildProcess(ssh, ['-G', 'aws-mde-test'])
    const r = await proc.run()
    if (r.exitCode !== 0) {
        // Should never happen...
        return { ok: false, err: 'ssh failed' }
    }
    const matches = r.stdout.match(/proxycommand.*mde_connect(.ps1)?/i)
    const hasMdeProxyCommand = matches && matches[0].includes(mdeScript)

    if (!hasMdeProxyCommand) {
        if (matches && matches[0]) {
            getLogger().warn('MDE: SSH config: found old/outdated aws-mde-* section:\n%O', matches[0])
            const oldConfig = localize(
                'AWS.mde.error.oldConfig',
                'Your ~/.ssh/config has a "aws-mde-*" section that might be out of date. Delete it, then try again.'
            )
            showViewLogsMessage(oldConfig)
            return { ok: false, err: 'old config' }
        }

        const confirmTitle = localize(
            'AWS.mde.confirm.installSshConfig.title',
            '{0} Toolkit will add host "aws-mde-*" to ~/.ssh/config. This allows you to use SSH with your {1} MDE environments.',
            getIdeProperties().company,
            getIdeProperties().company
        )
        const confirmText = localize('AWS.mde.confirm.installSshConfig.button', 'Update SSH config')
        const response = await showConfirmationMessage({ prompt: confirmTitle, confirm: confirmText })
        if (!response) {
            return { ok: false, err: 'user canceled' }
        }

        const sshConfigDir = path.join(SystemUtilities.getHomeDirectory(), '.ssh')
        const sshConfigPath = path.join(sshConfigDir, 'config')
        try {
            fs.mkdirpSync(sshConfigDir)
            fs.appendFileSync(sshConfigPath, mdeSshConfig)
        } catch (e) {
            getLogger().error('ensureMdeSshConfig: failed to write: %O', sshConfigPath)
            return { ok: false, err: 'write failed' }
        }
    }

    return { ok: true, err: '' }
}

/**
 * Checks if the SSM plugin CLI `session-manager-plugin` is available and
 * working, else prompts user to install it.
 *
 * @returns Result object indicating whether the SSH config is working, or failure reason.
 */
export async function ensureSsmCli(): Promise<{ ok: boolean; result: string }> {
    return getOrInstallCli('session-manager-plugin', false)
        .then(ssmPath => {
            return { ok: true, result: ssmPath }
        })
        .catch(e => {
            return { ok: false, result: e.message }
        })
}

export const SSH_AGENT_SOCKET_VARIABLE = 'SSH_AUTH_SOCK'

/**
 * Only mac has the agent running by default, other OS we need to start manually
 *
 * @returns `undefined` if agent is already running or on Windows, otherwise the SSH agent socket
 */
export async function startSshAgent(): Promise<string | undefined> {
    if (process.env[SSH_AGENT_SOCKET_VARIABLE] !== undefined) {
        return
    }

    getLogger().info('Starting SSH agent...')

    try {
        // TODO: if users are using
        if (process.platform === 'win32') {
            // First check if it's running
            // if not, try to start it
            // if that fails, try to set the start-up type to automatic
            // if that fails, then no agent
            const script = `
$info = Get-Service ssh-agent
if ($info.Status -eq "Running") { exit 0 }
Start-Service ssh-agent
if (!$?) {
    Get-Service -Name ssh-agent | Set-Service -StartupType Manual
    if ($?) { Start-Service ssh-agent }
}
exit $?
`
            execFileSync('powershell.exe', ['Invoke-Expression', script])
            // TODO: we should verify that the agent is active (or not) prior to running this codepath
            // On unix machines the environment variable is set, but on windows we might have to execute something to check
            vscode.window.showInformationMessage(localize('AWS.mde.ssh-agent.start', 'The SSH agent has been started.'))
            return
        }

        // note: using 'sync' callbacks since `promisify` is inconsistent
        // TODO: this command outputs a shell command that you're supposed to execute, for now
        // we'll just parse the socket out and inject it into the ssh command
        const result = execFileSync('ssh-agent', ['-s'])
        return (result.match(/$SSH_AGENT_VAR=(.*?);/) ?? [])[1]
    } catch (err) {
        getLogger().error('mde: failed to start SSH agent, clones may not work as expected: %O', err)
    }
}
